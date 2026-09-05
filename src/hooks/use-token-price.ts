import { useEffect, useState, useRef } from 'react'
import { type Address, formatUnits } from 'viem'

import {
  getPricing,
  getReadClient,
  getWatchClient,
  getPairToken0,
  pairAbi,
  readStoredBaseline,
  storeBaseline,
  type PricingResult,
} from '@/lib/pricing'

export interface TokenPriceData {
  priceBNB: number | null
  mcapBNB: number | null
  stage: PricingResult['stage']
  changePercent: number | null
}

export function useTokenPrice(
  tokenAddr: Address | '',
  totalSupply: bigint | undefined,
): TokenPriceData {
  const [result, setResult] = useState<PricingResult | null>(null)
  const baselineRef = useRef<number | null>(null)

  // 初始获取 + Sync 订阅
  useEffect(() => {
    if (!tokenAddr) return

    let cancelled = false

    const init = async () => {
      const client = getReadClient()
      const pricing = await getPricing(client, tokenAddr as Address)
      if (cancelled) return
      setResult(pricing)

      if (pricing.stage === 'live' && pricing.pair) {
        const t0 = await getPairToken0(client, pricing.pair)
        if (cancelled) return

        // 订阅实时 Sync
        const wsClient = getWatchClient()
        const unwatch = wsClient.watchContractEvent({
          address: pricing.pair,
          abi: pairAbi,
          eventName: 'Sync',
          onLogs: (logs) => {
            if (cancelled) return
            const { reserve0, reserve1 } = logs[0].args as {
              reserve0: bigint
              reserve1: bigint
            }
            const isT0 = t0.toLowerCase() === tokenAddr.toLowerCase()
            const tokenReserve = isT0 ? reserve0 : reserve1
            const bnbReserve = isT0 ? reserve1 : reserve0
            if (tokenReserve > 0n) {
              const priceBNB =
                Number(formatUnits(bnbReserve, 18)) /
                Number(formatUnits(tokenReserve, 18))
              setResult((prev) =>
                prev && prev.stage === 'live'
                  ? { ...prev, priceBNB, tokenReserve, bnbReserve }
                  : prev,
              )
            }
          },
        })

        return () => {
          unwatch()
        }
      }
    }

    const cleanup = init()
    return () => {
      cancelled = true
      cleanup?.then((fn) => fn?.())
    }
  }, [tokenAddr])

  // 解析涨幅基准价：预售发行价优先，否则用首次记录的 live 价格
  useEffect(() => {
    if (
      baselineRef.current !== null ||
      !tokenAddr ||
      !result ||
      result.stage !== 'live' ||
      result.priceBNB === null ||
      result.priceBNB <= 0
    ) {
      return
    }

    if (result.baselinePriceBNB && result.baselinePriceBNB > 0) {
      baselineRef.current = result.baselinePriceBNB
      return
    }

    const stored = readStoredBaseline(tokenAddr)
    if (stored !== null) {
      baselineRef.current = stored
    } else {
      storeBaseline(tokenAddr, result.priceBNB)
      baselineRef.current = result.priceBNB
    }
  }, [result, tokenAddr])

  if (!result || !totalSupply) {
    return { priceBNB: null, mcapBNB: null, stage: 'not_launched', changePercent: null }
  }

  const priceBNB = result.priceBNB
  const mcapBNB =
    priceBNB !== null ? priceBNB * Number(formatUnits(totalSupply, 18)) : null

  const baseline = baselineRef.current
  const changePercent =
    baseline !== null &&
    baseline > 0 &&
    priceBNB !== null
      ? ((priceBNB - baseline) / baseline) * 100
      : null

  return { priceBNB, mcapBNB, stage: result.stage, changePercent }
}