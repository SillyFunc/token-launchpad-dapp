import { Coins } from 'lucide-react'

import type { TokenDetail } from '@/api/token'
import { formatNumber } from '@/lib/format'
import type { Locale } from '@/lib/i18n'
import { useTokenPrice } from '@/hooks/use-token-price'

export interface TokenRowProps {
  token: TokenDetail
  totalSupplyData: bigint | undefined
  locale: Locale
  bnbUsd: number
}

export function TokenRow({ token, totalSupplyData, locale, bnbUsd }: TokenRowProps) {
  const tokenAddress = token.coinContractAddress || ''
  const { priceBNB, priceUSD, mcapUSD, tvlUSD, stage, changePercent } = useTokenPrice(
    tokenAddress as `0x${string}`,
    totalSupplyData,
    bnbUsd,
  )

  const priceText =
    priceUSD !== null
      ? `$${formatNumber(priceUSD, locale)}`
      : '--'
  const marketCapText =
    mcapUSD !== null
      ? `$${formatNumber(mcapUSD, locale)}`
      : stage === 'not_launched'
        ? '未开盘'
        : '--'
  const tvlWarning =
    tvlUSD !== null && tvlUSD < 200
      ? '低流动性'
      : null

  const isPositive = changePercent !== null && changePercent >= 0
  const changeText =
    changePercent !== null
      ? `${isPositive ? '+' : ''}${changePercent.toFixed(2)}%`
      : '--'

  return (
    <div className="flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-white/5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-white/30 bg-[#1a1c1e]">
          {token.coinImg ? (
            <img
              src={token.coinImg}
              alt={token.name}
              className="size-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <Coins className="size-4 text-[#FFA546]" />
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-bold leading-tight text-[#F0F0F0]">
            {token.name}
          </span>
          <div className="flex items-center gap-1 text-[10px] leading-normal text-white/60">
            <span className="text-[#FFA546]">
              {marketCapText}
            </span>
            {tvlWarning && (
              <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-400">
                {tvlWarning}
              </span>
            )}
            <span className="ml-1 text-white/70">
              {token.buyTax}%/{token.sellTax}%
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="w-14 text-right font-mono text-xs font-bold text-[#AAAAAA]">
          {priceText}
        </span>
        <div className="flex w-20 justify-end">
          <span
            className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-mono font-bold leading-none ${
              isPositive
                ? 'bg-[#0ECB81] text-white'
                : changePercent !== null
                  ? 'bg-[#F6465D] text-white'
                  : 'bg-neutral-800 text-neutral-500'
            }`}
          >
            {changeText}
          </span>
        </div>
      </div>
    </div>
  )
}