import {
  getPublicClient,
  waitForTransactionReceipt,
  writeContract,
  type WriteContractParameters,
} from '@wagmi/core'
import type { Config } from 'wagmi'
import type {
  Abi,
  ContractFunctionArgs,
  ContractFunctionName,
  TransactionReceipt,
} from 'viem'

/** Gas 预估缓冲：钱包实际执行环境与公共 RPC 预估存在偏差，上浮 20% */
const GAS_NUMERATOR = 120n
const GAS_DENOMINATOR = 100n

/** 交易已上链但执行 revert，与发送失败区分开 */
class TransactionRevertedError extends Error {
  constructor() {
    super('交易已在链上执行失败，请刷新页面确认最新状态后重试')
    this.name = 'TransactionRevertedError'
  }
}

/**
 * 合约写交易统一发送通道。
 *
 * TokenPocket 等移动钱包在确认页会自行调用其内部 RPC 的 eth_estimateGas
 * 做失败预判，与公共 RPC 口径不一致时误报「预估失败！该交易可能会失败！」。
 * 此通道分三步规避：
 *
 * 1. 在公共 RPC 上尽力预估 gas；节点的模拟结果只用于优化，不能阻断用户在钱包中签名，
 *    因为移动钱包与公共节点可能处于不同区块状态；
 * 2. 预估 gas 或调用方提供的 gas limit 会随交易传给钱包，尽可能避免钱包重新估算；
 *    gasPrice 仅在可用时附带，不能因费用读取失败而丢失已得到的 gas limit；
 * 3. 等待回执并校验执行状态，revert 交易不会冒充成功。
 *
 * @returns 交易回执（hash 可从 receipt.transactionHash 获取）
 */
export async function sendContractTx<
  const abi extends Abi | readonly unknown[],
  functionName extends ContractFunctionName<abi, 'nonpayable' | 'payable'>,
  args extends ContractFunctionArgs<
    abi,
    'nonpayable' | 'payable',
    functionName
  >,
>(
  config: Config,
  parameters: WriteContractParameters<
    abi,
    functionName,
    args,
    Config,
    Config['chains'][number]['id']
  >,
): Promise<TransactionReceipt> {
  // 泛型联合无法直接展开，收敛为具体形状透传（never 字段可赋给任意 wagmi 泛型位）
  const tx = parameters as unknown as {
    address: `0x${string}`
    abi: never
    functionName: never
    args?: never
    value?: bigint
    gas?: bigint
    account?: `0x${string}`
    chainId?: number
    connector?: never
  }

  const account = tx.account
  // 调用方可为已知、稳定成本的操作提供保守的 gas limit，公共节点估算成功时再以估算值覆盖。
  let gas = tx.gas
  let gasPrice: bigint | undefined

  if (account) {
    try {
      const publicClient = getPublicClient(
        config,
        tx.chainId ? { chainId: tx.chainId } : undefined,
      )
      if (publicClient) {
        const estimated = await publicClient.estimateContractGas({
          address: tx.address,
          abi: tx.abi,
          functionName: tx.functionName,
          ...(tx.args ? { args: tx.args } : {}),
          ...(tx.value !== undefined ? { value: tx.value } : {}),
          account,
        })
        gas = (estimated * GAS_NUMERATOR) / GAS_DENOMINATOR

        // Gas limit 已可独立使用；费用读取属于可选增强，不能影响它传给钱包。
        try {
          gasPrice = await publicClient.getGasPrice()
        } catch (gasPriceErr) {
          console.warn('Get gas price failed:', gasPriceErr)
        }
      }
    } catch (estimateErr) {
      console.warn('Estimate contract gas failed:', estimateErr)
    }
  }

  const hash = await writeContract(config, {
    ...tx,
    ...(gas !== undefined ? { gas } : {}),
    ...(gasPrice !== undefined ? { gasPrice } : {}),
  } as never)

  const receipt = await waitForTransactionReceipt(config, {
    hash,
    ...(tx.chainId ? { chainId: tx.chainId } : {}),
  })

  if (receipt.status !== 'success') throw new TransactionRevertedError()
  return receipt
}
