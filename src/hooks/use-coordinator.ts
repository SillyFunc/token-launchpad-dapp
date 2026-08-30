import { useCallback, useState } from 'react'
import { useConfig, useConnection, useReadContract } from 'wagmi'
import { waitForTransactionReceipt, writeContract } from '@wagmi/core'
import {
  bytesToHex,
  decodeEventLog,
  formatEther,
  parseGwei,
  type Abi,
  type Hex,
} from 'viem'

import CoordinatorFactoryAbiJson from '@/contracts/abi/CoordinatorFactory.json'
import { getContractAddresses } from '@/contracts/addresses'

// JSON 字面量推断的类型对 viem 泛型不友好，窄化为 Abi
const CoordinatorFactoryAbi = CoordinatorFactoryAbiJson as unknown as Abi

export type CreateTokenStatus =
  | 'idle'
  | 'signing'
  | 'confirming'
  | 'success'
  | 'error'

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

/** 合约自定义错误名 → 友好提示（名称来自 ABI，viem 报错信息中含错误名） */
const KNOWN_ERRORS: Record<string, string> = {
  EmptyTokenName: '代币名称不能为空',
  EmptyTokenSymbol: '代币符号不能为空',
  InsufficientCreationFee: '创建费用不足',
  ZeroCreationFee: '创建费用为零，请联系管理员',
  FactoryDisabled: '合约工厂已被禁用',
  InvalidSalt: '保留盐值无效',
  AddressAlreadyDeployed: '该代币地址已部署',
  AddressAlreadyReserved: '该代币地址已被保留',
  TokenCreationFailed: '代币创建失败',
  ETHTransferFailed: 'BNB 转账失败',
  InvalidFeeRecipient: '税费接收地址无效',
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100)
}

export function generateSalt(): Hex {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes, { size: 32 })
}

function parseErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (
      err.message.includes('User rejected') ||
      err.message.includes('rejected the request')
    ) {
      return '用户已取消交易'
    }
    for (const [name, msg] of Object.entries(KNOWN_ERRORS)) {
      if (err.message.includes(name)) return msg
    }
    return (
      (err as { shortMessage?: string }).shortMessage ?? err.message
    )
  }
  return '交易失败，请稍后重试'
}

/** 按当前钱包网络解析 CoordinatorFactory 地址 */
function useCoordinatorFactory() {
  const { chainId } = useConnection()
  return getContractAddresses(chainId)?.coordinatorFactory
}

/** 读取 Coordinator 创建费用 */
export function useCreationFee() {
  const address = useCoordinatorFactory()
  const query = useReadContract({
    address,
    abi: CoordinatorFactoryAbi,
    functionName: 'creationFee',
    query: { enabled: Boolean(address) },
  })

  return {
    ...query,
    // 泛型 Abi 下 data 推断为 unknown，手动窄化
    fee: (query.data as bigint | undefined) ?? undefined,
    formattedFee:
      query.data !== undefined && query.data !== null
        ? formatEther(query.data as bigint)
        : undefined,
  }
}

/** 创建代币：签名 → 确认 → 解析 TokenPresalePairCreated 事件 */
export function useCreateToken() {
  const config = useConfig()
  const { fee: creationFee, refetch: refetchFee } = useCreationFee()
  const coordinatorFactory = useCoordinatorFactory()

  const [status, setStatus] = useState<CreateTokenStatus>('idle')
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [result, setResult] = useState<CreateTokenResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setTxHash(null)
    setResult(null)
    setError(null)
  }, [])

  const execute = useCallback(
    async (params: CreateTokenParams): Promise<CreateTokenResult> => {
      setError(null)
      setStatus('signing')

      try {
        if (!coordinatorFactory) {
          throw new Error('当前网络不支持，请切换到 BSC 测试网')
        }

        // 合约约束: taxDuration > 0, antiFarmerDuration <= taxDuration
        const taxDuration = BigInt(params.taxDurationDays * 86400)
        const antiFarmerDuration = BigInt(
          params.antiFarmerDurationDays * 86400,
        )
        if (taxDuration <= 0n) throw new Error('税费存续期必须大于 0 天')
        if (antiFarmerDuration > taxDuration) {
          throw new Error('防「挖、提、卖」保护期不能大于税费存续期')
        }

        // 获取最新创建费用
        let fee = creationFee
        if (fee === undefined)
          fee = (await refetchFee()).data as bigint | undefined
        if (fee === undefined) throw new Error('未能获取创建费用，请检查网络连接')

        // BSC 测试网节点要求 gas tip >= 1 Gwei，显式指定防止钱包默认 0.1 Gwei 被拒收
        const hash = await writeContract(config, {
          address: coordinatorFactory,
          abi: CoordinatorFactoryAbi,
          functionName: 'createToken',
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
          maxFeePerGas: parseGwei('3'),
          maxPriorityFeePerGas: parseGwei('1.5'),
        })

        setTxHash(hash)
        setStatus('confirming')

        const receipt = await waitForTransactionReceipt(config, { hash })

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
          throw new Error('交易已确认，但未解析到代币创建事件')
        }

        const created: CreateTokenResult = {
          tokenAddress: token,
          presaleAddress: presale,
          txHash: hash,
        }
        setResult(created)
        setStatus('success')
        return created
      } catch (err) {
        setError(parseErrorMessage(err))
        setStatus('error')
        throw err
      }
    },
    [config, coordinatorFactory, creationFee, refetchFee],
  )

  return {
    execute,
    reset,
    status,
    txHash,
    result,
    error,
    isLoading: status === 'signing' || status === 'confirming',
    isSigning: status === 'signing',
    isConfirming: status === 'confirming',
    isSuccess: status === 'success',
    isError: status === 'error',
    tokenAddress: result?.tokenAddress ?? null,
  }
}
