import { useChainId, useConfig, useConnection, useReadContract } from 'wagmi'
import {
  readContract,
  waitForTransactionReceipt,
  writeContract,
} from '@wagmi/core'
import {
  decodeEventLog,
  formatEther,
  type Hex,
} from 'viem'

import { CoordinatorFactoryAbi } from '@/contracts/abi'
import {
  DEFAULT_CHAIN_ID,
  getContractAddresses,
} from '@/config/network'
import { findVanitySaltSync } from '@/lib/vanity-salt'

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
  InvalidVanitySuffix: 'INVALID_VANITY_SUFFIX',
  NotReserver: 'NOT_RESERVER',
  AddressAlreadyDeployed: 'ADDRESS_ALREADY_DEPLOYED',
  AddressAlreadyReserved: 'ADDRESS_ALREADY_RESERVED',
  InsufficientReservationFee: 'INSUFFICIENT_RESERVATION_FEE',
  TokenCreationFailed: 'TOKEN_CREATION_FAILED',
  ETHTransferFailed: 'ETH_TRANSFER_FAILED',
  InvalidFeeRecipient: 'INVALID_FEE_RECIPIENT',
  BuyFeeTooHigh: 'BUY_FEE_TOO_HIGH',
  SellFeeTooHigh: 'SELL_FEE_TOO_HIGH',
  InvalidTaxDuration: 'INVALID_TAX_DURATION',
  InvalidAntiFarmerDuration: 'INVALID_ANTI_FARMER_DURATION',
  InvalidAllocation: 'INVALID_ALLOCATION',
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100)
}

/** 8888 靓号盐生成器（带真随机熵派生，平均 65536 次尝试，秒级产出） */
export function generateSalt(): Hex {
  return findVanitySaltSync().salt
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

/** 按当前钱包网络解析 CoordinatorFactory 地址（缺省降级为默认网络） */
function useCoordinatorFactory() {
  const chainId = useChainId()
  const { chainId: connChainId } = useConnection()
  const effectiveChainId = connChainId || chainId || DEFAULT_CHAIN_ID
  return (
    getContractAddresses(effectiveChainId)?.coordinatorFactory ??
    getContractAddresses(DEFAULT_CHAIN_ID).coordinatorFactory
  )
}

/** 读取 Coordinator 创建费用 */
export function useCreationFee() {
  const address = useCoordinatorFactory()
  const query = useReadContract({
    address,
    abi: CoordinatorFactoryAbi,
    functionName: 'creationFee',
    chainId: DEFAULT_CHAIN_ID,
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

/** 读取 Coordinator 地址预留费用 */
export function useReservationFee() {
  const address = useCoordinatorFactory()
  const query = useReadContract({
    address,
    abi: CoordinatorFactoryAbi,
    functionName: 'reservationFee',
    chainId: DEFAULT_CHAIN_ID,
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

/** 锁定/预留 8888 靓号地址（可选防抢跑，0.01 BNB 服务费） */
export function useReserveTokenAddress() {
  const config = useConfig()
  const coordinatorFactory = useCoordinatorFactory()
  const { fee: reservationFee } = useReservationFee()

  const execute = async (salt: Hex) => {
    if (!coordinatorFactory) {
      throw new CoordinatorError('WRONG_NETWORK')
    }

    let fee = reservationFee
    if (fee === undefined) {
      try {
        fee = (await readContract(config, {
          address: coordinatorFactory,
          abi: CoordinatorFactoryAbi,
          functionName: 'reservationFee',
          chainId: DEFAULT_CHAIN_ID,
        })) as bigint
      } catch (readErr) {
        console.warn('Direct readContract reservationFee failed:', readErr)
      }
    }
    // 若网络瞬时异常，保底采用合约设定值 0.01 BNB
    if (fee === undefined) {
      fee = 10000000000000000n
    }

    const hash = await writeContract(config, {
      address: coordinatorFactory,
      abi: CoordinatorFactoryAbi,
      functionName: 'reserveTokenAddress',
      chainId: DEFAULT_CHAIN_ID,
      args: [salt],
      value: fee,
    })

    const receipt = await waitForTransactionReceipt(config, {
      hash,
      chainId: DEFAULT_CHAIN_ID,
    })

    return { hash, receipt }
  }

  return {
    execute: (salt: Hex) => {
      return execute(salt).catch((err) => {
        throw toCoordinatorError(err)
      })
    },
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
          chainId: DEFAULT_CHAIN_ID,
        })) as bigint
      } catch (readErr) {
        console.warn('Direct readContract creationFee failed:', readErr)
      }
    }
    // 若网络瞬时异常，保底采用合约设定值 0.005 BNB (5000000000000000 wei)
    if (fee === undefined) {
      fee = 5000000000000000n
    }

    // 4. 显式指定目标 chainId 发起合约调用
    const hash = await writeContract(config, {
      address: coordinatorFactory,
      abi: CoordinatorFactoryAbi,
      functionName: 'createToken',
      chainId: DEFAULT_CHAIN_ID,
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
      chainId: DEFAULT_CHAIN_ID,
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
