import { useConfig, useConnection } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import {
  getBlock,
  getBlockNumber,
  getContractEvents,
  readContract,
  type Config,
} from '@wagmi/core'
import type { Hex } from 'viem'

import { CoordinatorFactoryAbi } from '@/contracts/abi'
import { DEFAULT_CHAIN_ID, getContractAddresses } from '@/config/network'
import { getReservedSaltRecords } from '@/lib/reserved-salt-store'

/** CoordinatorFactory 部署区块（2026-09-04），预留事件查询的最早起点 */
const COORDINATOR_DEPLOY_BLOCK = 129039313n

/**
 * 公共 RPC 对 eth_getLogs 有单次 5 万块上限，且旧块历史会被裁剪；
 * 分块从新到旧扫描，命中不可服务（超限/裁剪）的分块即停止回溯。
 */
const LOG_CHUNK_BLOCKS = 40_000n

/** 本地生成记录的链上验证上限，防止长期使用后请求量失控 */
const MAX_VERIFY_RECORDS = 50

export interface ReservedAddress {
  token: Hex
  /** 锁定时间（毫秒）；仅能定位到链上事件块时间或本地存档时间，皆不可得时为 null */
  reservedAt: number | null
  txHash: Hex | null
}

interface ReserveEventHit {
  token: Hex
  blockNumber: bigint
  txHash: Hex | null
}

/**
 * 查询当前钱包锁定（预留）的代币地址：
 * ① 链上 TokenAddressReserved 事件按预留人过滤（受 RPC 日志历史深度限制，尽力而为）
 * ② 本机生成过的地址逐个读 tokenAddressReserver 验证权属，兜住日志被裁剪的部分
 * 两者合并去重，所有条目均以链上数据为准。
 */
async function fetchReservedAddresses(
  config: Config,
  reserver: Hex,
): Promise<ReservedAddress[]> {
  const coordinator = getContractAddresses(DEFAULT_CHAIN_ID).coordinatorFactory

  // ① 事件日志
  const hits = new Map<string, ReserveEventHit>()
  try {
    let end = await getBlockNumber(config, { chainId: DEFAULT_CHAIN_ID })
    while (end >= COORDINATOR_DEPLOY_BLOCK) {
      const start =
        end - LOG_CHUNK_BLOCKS + 1n > COORDINATOR_DEPLOY_BLOCK
          ? end - LOG_CHUNK_BLOCKS + 1n
          : COORDINATOR_DEPLOY_BLOCK
      let logs: ReserveEventHit[]
      try {
        const raw = await getContractEvents(config, {
          address: coordinator,
          abi: CoordinatorFactoryAbi,
          eventName: 'TokenAddressReserved',
          args: { reserver },
          fromBlock: start,
          toBlock: end,
          chainId: DEFAULT_CHAIN_ID,
        })
        logs = raw.flatMap((log) => {
          // 宽泛 ABI 下 viem 的事件参数类型为松散联合，运行时按本事件结构解码
          const { token } = (
            log as unknown as { args?: { token?: Hex } }
          ).args ?? {}
          if (!token) return []
          return [
            {
              token,
              blockNumber: log.blockNumber,
              txHash: log.transactionHash ?? null,
            },
          ]
        })
      } catch {
        // 当前分块超出节点可服务范围（历史裁剪/区间超限），更早的分块只会同样失败
        break
      }
      for (const hit of logs) {
        hits.set(hit.token.toLowerCase(), hit)
      }
      if (start === COORDINATOR_DEPLOY_BLOCK) break
      end = start - 1n
    }
  } catch {
    // 取块高等异常不阻断流程，继续走本地记录验证
  }

  // ② 本地生成记录的链上权属验证
  const locals = getReservedSaltRecords()
  const pendingVerify = locals
    .filter((r) => !hits.has(r.token.toLowerCase()))
    .slice(-MAX_VERIFY_RECORDS)
  if (pendingVerify.length > 0) {
    const results = await Promise.allSettled(
      pendingVerify.map((record) =>
        readContract(config, {
          address: coordinator,
          abi: CoordinatorFactoryAbi,
          functionName: 'tokenAddressReserver',
          args: [record.token],
          chainId: DEFAULT_CHAIN_ID,
        }),
      ),
    )
    results.forEach((settled, index) => {
      if (settled.status !== 'fulfilled') return
      const record = pendingVerify[index]
      const onchainReserver = settled.value as unknown as Hex | undefined
      if (onchainReserver?.toLowerCase() === reserver.toLowerCase()) {
        hits.set(record.token.toLowerCase(), {
          token: record.token,
          blockNumber: 0n,
          txHash: record.txHash,
        })
      }
    })
  }

  // ③ 补齐事件块时间戳，按锁定时间倒序
  const blockNumbers = new Set(
    [...hits.values()]
      .filter((hit) => hit.blockNumber > 0n)
      .map((hit) => hit.blockNumber),
  )
  const timestamps = new Map<bigint, number>()
  await Promise.all(
    [...blockNumbers].map(async (blockNumber) => {
      try {
        const block = await getBlock(config, {
          blockNumber,
          chainId: DEFAULT_CHAIN_ID,
        })
        timestamps.set(blockNumber, Number(block.timestamp) * 1000)
      } catch {
        // 时间不可得时留空
      }
    }),
  )

  return [...hits.values()]
    .map((hit) => {
      const local = locals.find(
        (r) => r.token.toLowerCase() === hit.token.toLowerCase(),
      )
      return {
        token: hit.token,
        reservedAt:
          timestamps.get(hit.blockNumber) ?? local?.reservedAt ?? null,
        txHash: hit.txHash ?? local?.txHash ?? null,
      }
    })
    .sort((a, b) => (b.reservedAt ?? 0) - (a.reservedAt ?? 0))
}

/** 当前连接钱包锁定（预留）的代币地址列表，从链上查询 */
export function useReservedAddresses() {
  const config = useConfig()
  const { address } = useConnection()

  const query = useQuery({
    queryKey: ['reserved-addresses', address ?? ''],
    queryFn: () => fetchReservedAddresses(config, address as Hex),
    enabled: Boolean(address),
    staleTime: 30_000,
  })

  return {
    ...query,
    addresses: query.data ?? [],
  }
}
