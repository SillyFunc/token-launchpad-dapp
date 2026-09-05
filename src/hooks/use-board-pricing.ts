import { useEffect, useMemo, useState } from 'react'
import { useReadContracts } from 'wagmi'
import {
  formatUnits,
  isAddress,
  zeroAddress,
  type Address,
  type ContractFunctionParameters,
} from 'viem'

import type { TokenDetail } from '@/api/token'
import { DEFAULT_CHAIN_ID } from '@/config/network'
import {
  COORDINATOR,
  coordinatorAbi,
  pairAbi,
  presaleAbi,
  readStoredBaseline,
  storeBaseline,
  tokenAbi,
} from '@/lib/pricing'

export type BoardStage = 'live' | 'presale' | 'not_launched'

export interface BoardTokenPricing {
  totalSupply: bigint | undefined
  stage: BoardStage
  priceBNB: number | null
  bnbReserve: bigint | null
  changePercent: number | null
}

type LaunchStatus = readonly [boolean, bigint, bigint, bigint, boolean, boolean]

interface MulticallSlot {
  result: unknown
  status: 'success' | 'failure'
}

function slot(data: unknown, index: number): MulticallSlot | undefined {
  if (!Array.isArray(data) || index >= data.length) return undefined
  return data[index] as MulticallSlot
}

/**
 * 行情榜单批量定价 — 用 3 次 useReadContracts(multicall)替代每个列表项各自发起的请求链：
 * ① totalSupply + tokenPresales（每代币 2 读）
 * ② lpAddress + getLaunchStatus + presaleTokenPrice（每个预售 3 读）
 * ③ token0 + getReserves（每个已加池交易对 2 读）
 * 无论列表多长，页面加载至多 3 个批量请求；②③按 30s/15s 轮询刷新价格。
 */
export function useBoardPricing(
  tokens: TokenDetail[],
): Record<string, BoardTokenPricing> {
  const entries = useMemo(() => {
    const list: { key: string; address: Address }[] = []
    for (const t of tokens) {
      const addr = t.coinContractAddress || ''
      if (!addr || !isAddress(String(addr))) continue
      const address = String(addr) as Address
      list.push({ key: address.toLowerCase(), address })
    }
    return list
  }, [tokens])

  /* ① 全量代币：totalSupply + tokenPresales ------------------------------- */
  const phase1Contracts = useMemo<ContractFunctionParameters[]>(
    () =>
      entries.flatMap((e) => [
        {
          address: e.address,
          abi: tokenAbi,
          functionName: 'totalSupply',
          chainId: DEFAULT_CHAIN_ID,
        },
        {
          address: COORDINATOR,
          abi: coordinatorAbi,
          functionName: 'tokenPresales',
          args: [e.address],
          chainId: DEFAULT_CHAIN_ID,
        },
      ]),
    [entries],
  )

  const { data: phase1Data } = useReadContracts({
    contracts: phase1Contracts,
    query: { enabled: phase1Contracts.length > 0, staleTime: 60_000 },
  })

  const tokenStates = useMemo(() => {
    return entries.map((e, i) => {
      const supply = slot(phase1Data, i)
      const presale = slot(phase1Data, entries.length + i)
      return {
        key: e.key,
        totalSupply:
          supply?.status === 'success' ? (supply.result as bigint) : undefined,
        presale:
          presale?.status === 'success' && presale.result !== zeroAddress
            ? (presale.result as Address)
            : null,
      }
    })
  }, [entries, phase1Data])

  /* ② 有预售的代币：lpAddress / getLaunchStatus / presaleTokenPrice -------- */
  const presaleStates = useMemo(
    () =>
      tokenStates.flatMap((s) => (s.presale ? [{ ...s, presale: s.presale }] : [])),
    [tokenStates],
  )

  const phase2Contracts = useMemo<ContractFunctionParameters[]>(
    () =>
      presaleStates.flatMap((s) => [
        {
          address: s.presale,
          abi: presaleAbi,
          functionName: 'lpAddress',
          chainId: DEFAULT_CHAIN_ID,
        },
        {
          address: s.presale,
          abi: presaleAbi,
          functionName: 'getLaunchStatus',
          chainId: DEFAULT_CHAIN_ID,
        },
        {
          address: s.presale,
          abi: presaleAbi,
          functionName: 'presaleTokenPrice',
          chainId: DEFAULT_CHAIN_ID,
        },
      ]),
    [presaleStates],
  )

  const { data: phase2Data } = useReadContracts({
    contracts: phase2Contracts,
    query: {
      enabled: phase2Contracts.length > 0,
      staleTime: 30_000,
      refetchInterval: 30_000,
    },
  })

  const pairStates = useMemo(() => {
    return presaleStates.map((s, i) => {
      const lp = slot(phase2Data, i * 3)
      const launch = slot(phase2Data, i * 3 + 1)
      const price = slot(phase2Data, i * 3 + 2)
      // 纯发币模式可能没有 presaleTokenPrice（调用 revert），multicall 单槽失败不影响整体
      const presalePriceRaw = price?.status === 'success' ? (price.result as bigint) : null
      const pairAddr = lp?.status === 'success' ? (lp.result as Address) : null
      return {
        ...s,
        pair: pairAddr && pairAddr !== zeroAddress ? pairAddr : null,
        launchStatus:
          launch?.status === 'success' ? (launch.result as LaunchStatus) : null,
        presalePrice:
          presalePriceRaw && presalePriceRaw > 0n ? presalePriceRaw : null,
      }
    })
  }, [presaleStates, phase2Data])

  /* ③ 已加池的交易对：token0 + getReserves --------------------------------- */
  const liveCandidates = useMemo(
    () => pairStates.flatMap((s) => (s.pair ? [{ ...s, pair: s.pair }] : [])),
    [pairStates],
  )

  const phase3Contracts = useMemo<ContractFunctionParameters[]>(
    () =>
      liveCandidates.flatMap((s) => [
        {
          address: s.pair,
          abi: pairAbi,
          functionName: 'token0',
          chainId: DEFAULT_CHAIN_ID,
        },
        {
          address: s.pair,
          abi: pairAbi,
          functionName: 'getReserves',
          chainId: DEFAULT_CHAIN_ID,
        },
      ]),
    [liveCandidates],
  )

  const { data: phase3Data } = useReadContracts({
    contracts: phase3Contracts,
    query: {
      enabled: phase3Contracts.length > 0,
      staleTime: 15_000,
      refetchInterval: 15_000,
    },
  })

  /* 聚合：地址 → 定价结果 + 发行价基准 ------------------------------------- */
  const aggregated = useMemo(() => {
    const map: Record<
      string,
      { pricing: BoardTokenPricing; baselinePriceBNB: number | null }
    > = {}
    for (const s of tokenStates) {
      map[s.key] = {
        baselinePriceBNB: null,
        pricing: {
          totalSupply: s.totalSupply,
          stage: 'not_launched',
          priceBNB: null,
          bnbReserve: null,
          changePercent: null,
        },
      }
    }

    // 预售期：lp 未添加，且 getLaunchStatus 为 enabled 且 status < 3 时用发行价展示
    for (const s of pairStates) {
      if (s.pair) continue
      const claimed = s.launchStatus?.[5] === true
      const launchEnabled = s.launchStatus?.[0] === true
      const launchStep = s.launchStatus ? Number(s.launchStatus[1]) : -1

      // 已领取（纯发币领取完成，或开盘后仓空）→ 已开盘（等待创建者自建池）
      if (claimed) {
        map[s.key] = {
          baselinePriceBNB: null,
          pricing: {
            totalSupply: s.totalSupply,
            stage: 'live',
            priceBNB: null,
            bnbReserve: null,
            changePercent: null,
          },
        }
        continue
      }

      // 已开启预售（认购中 / 认购结束待开盘）→ 预售中
      if (launchEnabled && (launchStep === 1 || launchStep === 2)) {
        map[s.key] = {
          baselinePriceBNB: null,
          pricing: {
            totalSupply: s.totalSupply,
            stage: 'presale',
            priceBNB: s.presalePrice
              ? Number(formatUnits(s.presalePrice, 18))
              : null,
            bnbReserve: null,
            changePercent: null,
          },
        }
      }

      // 其余（未开启预售 / 配置未开启 / 预售失败）保持未开盘
    }

    // 已开盘：pair 储备计价，预售发行价作为涨幅基准
    liveCandidates.forEach((s, i) => {
      const t0 = slot(phase3Data, i * 2)
      const reserves = slot(phase3Data, i * 2 + 1)
      const t0Addr = t0?.status === 'success' ? (t0.result as Address) : null
      const [r0, r1] =
        reserves?.status === 'success'
          ? (reserves.result as readonly [bigint, bigint, number])
          : [null, null]
      if (!t0Addr || r0 === null || r1 === null) return

      const isT0 = t0Addr.toLowerCase() === s.key
      const tokenReserve = isT0 ? r0 : r1
      const bnbReserve = isT0 ? r1 : r0
      if (tokenReserve <= 0n) return

      map[s.key] = {
        baselinePriceBNB: s.presalePrice
          ? Number(formatUnits(s.presalePrice, 18))
          : null,
        pricing: {
          totalSupply: s.totalSupply,
          stage: 'live',
          priceBNB:
            Number(formatUnits(bnbReserve, 18)) /
            Number(formatUnits(tokenReserve, 18)),
          bnbReserve,
          changePercent: null,
        },
      }
    })

    return map
  }, [tokenStates, pairStates, liveCandidates, phase3Data])

  /* 无发行价的 live 代币：首次见到的价格记录为涨幅基准（localStorage）------- */
  const [firstSeenBaselines, setFirstSeenBaselines] = useState<
    Record<string, number>
  >({})

  useEffect(() => {
    const additions: Record<string, number> = {}
    for (const [key, agg] of Object.entries(aggregated)) {
      const { pricing, baselinePriceBNB } = agg
      if (pricing.stage !== 'live' || !pricing.priceBNB || pricing.priceBNB <= 0)
        continue
      if (baselinePriceBNB || key in firstSeenBaselines) continue
      const stored = readStoredBaseline(key)
      if (stored !== null) {
        additions[key] = stored
      } else {
        storeBaseline(key, pricing.priceBNB)
        additions[key] = pricing.priceBNB
      }
    }
    if (Object.keys(additions).length > 0) {
      setFirstSeenBaselines((prev) => ({ ...prev, ...additions }))
    }
  }, [aggregated, firstSeenBaselines])

  /* 补齐 changePercent（预售期不计涨幅，与原逻辑一致）---------------------- */
  return useMemo(() => {
    const out: Record<string, BoardTokenPricing> = {}
    for (const [key, agg] of Object.entries(aggregated)) {
      const { pricing, baselinePriceBNB } = agg
      const baseline =
        pricing.stage === 'live'
          ? (baselinePriceBNB ?? firstSeenBaselines[key] ?? null)
          : null
      const changePercent =
        baseline && baseline > 0 && pricing.priceBNB
          ? ((pricing.priceBNB - baseline) / baseline) * 100
          : null
      out[key] = { ...pricing, changePercent }
    }
    return out
  }, [aggregated, firstSeenBaselines])
}
