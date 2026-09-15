import { useEffect, useState } from 'react'
import { type Address, formatUnits } from 'viem'

import {
  getPricing,
  getReadClient,
  getWatchClient,
  getPairToken0,
  pairAbi,
  type PricingResult,
} from '@/lib/pricing'

export interface TokenPriceData {
  priceBNB: number | null
  mcapBNB: number | null
  stage: PricingResult['stage']
  changePercent: number | null
  /** 用于第三方行情页定位市场的 Pancake V2 Pair 地址。 */
  pairAddress: PricingResult['pair']
}

export function useTokenPrice(
  tokenAddr: Address | '',
  totalSupply: bigint | undefined,
): TokenPriceData {
  const [result, setResult] = useState<PricingResult | null>(null)

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

  if (!result || !totalSupply) {
    return {
      priceBNB: null,
      mcapBNB: null,
      stage: 'not_launched',
      changePercent: null,
      pairAddress: result?.pair ?? null,
    }
  }

  const priceBNB = result.priceBNB
  const mcapBNB =
    priceBNB !== null ? priceBNB * Number(formatUnits(totalSupply, 18)) : null

  // 涨幅严格以预售价为基准；没有预售价的代币不显示涨幅，避免使用本地首次访问价格。
  const baseline = result.baselinePriceBNB
  const changePercent =
    result.stage === 'live' &&
    baseline !== null &&
    baseline > 0 &&
    priceBNB !== null
      ? ((priceBNB - baseline) / baseline) * 100
      : null

  return {
    priceBNB,
    mcapBNB,
    stage: result.stage,
    changePercent,
    pairAddress: result.pair,
  }
}
