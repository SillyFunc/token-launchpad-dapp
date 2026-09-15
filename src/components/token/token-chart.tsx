import { ExternalLink, LineChart, LoaderCircle } from 'lucide-react'
import type { Address, Hex } from 'viem'

import { KlineChart } from '../common/kline-chart'

interface TokenChartProps {
  tokenAddress?: Hex
  pairAddress: Address | null
}

export function TokenChart({ tokenAddress, pairAddress }: TokenChartProps) {
  if (!tokenAddress) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-xs text-[#A0A3A7]">
        <LineChart className="size-6 text-[#FFA546]" aria-hidden="true" />
        <span>请提供有效的代币合约地址以加载图表</span>
      </div>
    )
  }

  if (!pairAddress) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-xs text-[#A0A3A7]">
        <LoaderCircle
          className="size-5 animate-spin text-[#FFA546]"
          aria-hidden="true"
        />
        <span>正在定位 BNB 交易对</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <KlineChart tokenAddress={pairAddress} />
      <a
        href={`https://pancakeswap.finance/swap?outputCurrency=${tokenAddress}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 items-center justify-center gap-1.5 border border-foreground/20 bg-foreground/5 px-4 text-xs font-semibold text-foreground transition-colors hover:border-primary/60 hover:text-primary focus-visible:border-primary focus-visible:text-primary focus-visible:outline-none"
      >
        前往 PancakeSwap 交易
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  )
}
