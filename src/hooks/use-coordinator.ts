import { useAccount, useChainId, useConfig, useReadContract } from 'wagmi'
import {
  readContract,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from '@wagmi/core'
import {
  bytesToHex,
  decodeEventLog,
  formatEther,
  type Abi,
  type Hex,
} from 'viem'

import CoordinatorFactoryAbiJson from '@/contracts/abi/CoordinatorFactory.json'
import { CONTRACT_ADDRESSES, getContractAddresses } from '@/contracts/addresses'

// JSON 字面量推断的类型对 viem 泛型不友好，窄化为 Abi
const CoordinatorFactoryAbi = CoordinatorFactoryAbiJson as unknown as Abi

export interface CreateTokenParams {
  name: string
  symbol: string
  meta: string
  /** 买入税率，百分比 (0-10) */
  buyTax: number
  /** 卖出税率，百分比 (0-10) */
  sellTax: number
  feeRecipient: Hex
  /** 税费存续期，天 (>=1) */
  taxDurationDays: number
  /** 防「挖、提、卖」保护期，天 (0-365，<= taxDurationDays) */
  antiFarmerDurationDays: number
  /** CREATE2 盐值，缺省随机生成 */
  salt?: Hex
}

export interface CreateTokenResult {
  tokenAddress: Hex
  presaleAddress: Hex
  txHash: Hex
}

/** 合约自定义错误名 → 错误标识（名称来自 ABI，viem 报错信息中含错误名） */
const KNOWN_ERRORS: Record<string, string> = {
  EmptyTokenName: 'EMPTY_TOKEN_NAME',
  EmptyTokenSymbol: 'EMPTY_TOKEN_SYMBOL',
  InsufficientCreationFee: 'INSUFFICIENT_CREATION_FEE',
  ZeroCreationFee: 'ZERO_CREATION_FEE',
  FactoryDisabled: 'FACTORY_DISABLED',
  InvalidSalt: 'INVALID_SALT',
  AddressAlreadyDeployed: 'ADDRESS_ALREADY_DEPLOYED',
  AddressAlreadyReserved: 'ADDRESS_ALREADY_RESERVED',
  TokenCreationFailed: 'TOKEN_CREATION_FAILED',
  ETHTransferFailed: 'ETH_TRANSFER_FAILED',
  InvalidFeeRecipient: 'INVALID_FEE_RECIPIENT',
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100)
}

export function generateSalt(): Hex {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes, { size: 32 })
}

/** 契约层错误码，由调用方（UI 层）映射为具体文案 */
export type CoordinatorErrorCode =
  | 'USER_REJECTED'
  | 'INSUFFICIENT_FUNDS'
  | 'WRONG_NETWORK'
  | 'INVALID_PARAMS'
  | 'EVENT_NOT_FOUND'
  | (typeof KNOWN_ERRORS)[keyof typeof KNOWN_ERRORS]

export class CoordinatorError extends Error {
  constructor(
    public readonly code: CoordinatorErrorCode,
    public readonly cause?: unknown,
  ) {
    super(code)
    this.name = 'CoordinatorError'
  }
}

function toCoordinatorError(err: unknown): CoordinatorError {
  if (err instanceof CoordinatorError) return err

  if (err instanceof Error || typeof err === 'object') {
    const msg =
      err instanceof Error
        ? err.message
        : String((err as { shortMessage?: string }).shortMessage ?? err)

    if (msg.includes('User rejected') || msg.includes('rejected the request')) {
      return new CoordinatorError('USER_REJECTED', err)
    }
    if (
      msg.includes('insufficient funds') ||
      msg.includes('exceeds balance')
    ) {
      return new CoordinatorError('INSUFFICIENT_FUNDS', err)
    }
    for (const [abiName, code] of Object.entries(KNOWN_ERRORS)) {
      if (msg.includes(abiName)) return new CoordinatorError(code, err)
    }
  }

  // 无法识别的底层错误，原样抛出由调用方兜底
  return err as CoordinatorError
}

/** 按当前钱包网络解析 CoordinatorFactory 地址（缺省降级为 BSC 测试网 97） */
function useCoordinatorFactory() {
  const chainId = useChainId()
  const { chainId: connChainId } = useAccount()
  const effectiveChainId = connChainId || chainId || 97
  return (
    getContractAddresses(effectiveChainId)?.coordinatorFactory ??
    CONTRACT_ADDRESSES[97].coordinatorFactory
  )
}

/** 读取 Coordinator 创建费用 */
export function useCreationFee() {
  const address = useCoordinatorFactory()
  const query = useReadContract({
    address,
    abi: CoordinatorFactoryAbi,
    functionName: 'creationFee',
    chainId: 97,
    query: {
      enabled: Boolean(address),
      staleTime: 30_000,
    },
  })

  const fee = (query.data as bigint | undefined) ?? undefined

  return {
    ...query,
    fee,
    formattedFee:
      fee !== undefined && fee !== null
        ? formatEther(fee)
        : undefined,
  }
}

/** 创建代币：网络切换 → 链上部署 → 解析 TokenPresalePairCreated 事件，无任何 UI 状态 */
export function useCreateToken() {
  const config = useConfig()
  const { fee: creationFee } = useCreationFee()
  const coordinatorFactory = useCoordinatorFactory()

  const execute = async (
    params: CreateTokenParams,
  ): Promise<CreateTokenResult> => {
    // 1. 确保钱包当前处于 BSC 测试网 (97)，若不是则自动发起网络切换
    if (config.state.chainId !== 97) {
      try {
        await switchChain(config, { chainId: 97 })
      } catch (err) {
        throw new CoordinatorError('WRONG_NETWORK', err)
      }
    }

    if (!coordinatorFactory) {
      throw new CoordinatorError('WRONG_NETWORK')
    }

    // 2. 合约约束: taxDuration > 0, antiFarmerDuration <= taxDuration
    const taxDuration = BigInt(params.taxDurationDays * 86400)
    const antiFarmerDuration = BigInt(params.antiFarmerDurationDays * 86400)
    if (taxDuration <= 0n || antiFarmerDuration > taxDuration) {
      throw new CoordinatorError('INVALID_PARAMS')
    }

    // 3. 获取最新创建费用
    let fee = creationFee
    if (fee === undefined) {
      try {
        fee = (await readContract(config, {
          address: coordinatorFactory,
          abi: CoordinatorFactoryAbi,
          functionName: 'creationFee',
          chainId: 97,
        })) as bigint
      } catch (readErr) {
        console.warn('Direct readContract creationFee failed:', readErr)
      }
    }
    // 若网络瞬时异常，保底采用合约设定值 0.005 BNB (5000000000000000 wei)
    if (fee === undefined) {
      fee = 5000000000000000n
    }

    // 4. 显式指定 chainId: 97 发起合约调用
    const hash = await writeContract(config, {
      address: coordinatorFactory,
      abi: CoordinatorFactoryAbi,
      functionName: 'createToken',
      chainId: 97,
      args: [
        {
          name: params.name.trim(),
          symbol: params.symbol.trim(),
          meta: params.meta,
          buyTax: percentToBps(params.buyTax),
          sellTax: percentToBps(params.sellTax),
          feeRecipient: params.feeRecipient,
          taxDuration,
          antiFarmerDuration,
          liqExpectedOutputAmount: 0n,
        },
        params.salt ?? generateSalt(),
      ],
      value: fee,
    })

    // 5. 等待区块确认
    const receipt = await waitForTransactionReceipt(config, {
      hash,
      chainId: 97,
    })

    // 6. 解析 TokenPresalePairCreated 事件
    let token: Hex | undefined
    let presale: Hex | undefined
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: CoordinatorFactoryAbi,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === 'TokenPresalePairCreated') {
          ;({ token, presale } = decoded.args as unknown as {
            token: Hex
            presale: Hex
          })
          break
        }
      } catch {
        // 非目标合约事件，跳过
      }
    }
    if (!token || !presale) {
      throw new CoordinatorError('EVENT_NOT_FOUND')
    }

    return {
      tokenAddress: token,
      presaleAddress: presale,
      txHash: hash,
    }
  }

  return {
    execute: (params: CreateTokenParams) => {
      // 统一在出口处将底层错误转换为契约错误码，UI 层无需感知原始异常结构
      return execute(params).catch((err) => {
        throw toCoordinatorError(err)
      })
    },
  }
}
