import { memo } from 'react'

function KlineChartImpl({ tokenAddress }: { tokenAddress: string }) {
  return (
    <div className="h-120 w-full overflow-hidden rounded border border-[#2F3737] bg-[#141517]">
      <iframe
        title="Flap 行情图表"
        src={`https://www.defined.fi/bsc/${tokenAddress}/embed?hideTxTable=1&hideSidebar=1&hideChart=0&hideChartEmptyBars=1&chartSmoothing=0&embedColorMode=DEFAULT&quoteToken=token0`}
        className="size-full transition-opacity duration-200"
        allow="clipboard-write; clipboard-read"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        loading="lazy"
      />
    </div>
  )
}

/** memo 缓存：tokenAddress 不变时不随父组件重渲染，避免 iframe 反复加载触发 429 */
export const KlineChart = memo(KlineChartImpl)
