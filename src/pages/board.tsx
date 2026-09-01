import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useReadContract } from 'wagmi'
import { formatUnits, type Abi } from 'viem'
import {
  Flame,
  Search,
  SlidersHorizontal,
  AlignJustify,
  Grid2X2,
  ChevronDown,
  Coins,
  X,
} from 'lucide-react'

import boardBanner from '@/assets/images/board-banner.png'
import { getPopularTokens, type TokenDetail } from '@/api/token'
import FlapTaxTokenV3AbiJson from '@/contracts/abi/FlapTaxTokenV3.json'

const FlapTaxTokenV3Abi = FlapTaxTokenV3AbiJson as unknown as Abi

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
})

function formatUsd(value: number | null | undefined): string {
  const num = Number(value)
  if (!Number.isFinite(num) || num === 0) return '--'
  return usdFormatter.format(num)
}

function formatPrice(value: number | null | undefined): string {
  const num = Number(value)
  if (!Number.isFinite(num) || num === 0) return '--'
  return usdFormatter.format(num)
}

function formatChange(value: number | null | undefined): string {
  const num = Number(value)
  if (!Number.isFinite(num) || num === 0) return '0.00%'
  return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`
}

const totalSupplyFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

function formatTotalSupply(supply: bigint): string {
  return totalSupplyFormatter.format(Number(formatUnits(supply, 18)))
}

function getTokenLogo(token: TokenDetail): string {
  return token.coinImg || ''
}

function getChangePercent(token: TokenDetail): number {
  const issue = Number(token.issuePrice)
  const trade = Number(token.tradePrice)
  if (!Number.isFinite(issue) || !Number.isFinite(trade) || issue <= 0) {
    return 0
  }
  return ((trade - issue) / issue) * 100
}

export const Board = () => {
  const [activeFilter, setActiveFilter] = useState('热门')
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  const {
    data: tokens,
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['popularTokens'],
    queryFn: () => getPopularTokens(),
    staleTime: 30_000,
  })

  const tokenList: TokenDetail[] = Array.isArray(tokens?.list)
    ? tokens.list
    : []

  // 所有代币发行量固定，只需取第一个已发行代币查询一次
  const supplyToken = tokenList.find((t) => t.coinContractAddress)
  const totalSupplyData = useReadContract({
    address: supplyToken?.coinContractAddress as `0x${string}` | undefined,
    abi: FlapTaxTokenV3Abi,
    functionName: 'totalSupply',
    chainId: 97,
    query: {
      enabled: Boolean(supplyToken),
      staleTime: Infinity,
    },
  }).data as bigint | undefined
  const totalSupplyText =
    totalSupplyData !== undefined && totalSupplyData !== null
      ? formatTotalSupply(totalSupplyData)
      : '--'

  const filterOptions = ['热门', '最新', '市值榜', '涨幅榜']

  const displayedTokens = tokenList.filter((t) => {
    if (!searchKeyword.trim()) return true
    const kw = searchKeyword.toLowerCase()
    return (
      t.name.toLowerCase().includes(kw) ||
      t.symbol.toLowerCase().includes(kw) ||
      t.address.toLowerCase().includes(kw)
    )
  })

  return (
    <div className="relative mx-auto flex w-full flex-col pb-24 pt-3 text-white space-y-3">
      {/* 1. 顶部轮播 / Banner 区域 (Figma Group 181: 343x122) */}
      <div className="relative w-full overflow-hidden rounded-md border border-white/10 bg-black">
        <img
          src={boardBanner}
          alt="Banner"
          className="h-32 w-full object-cover"
        />
        {/* 底部小圆点指示器 */}
        <div className="absolute inset-x-0 bottom-2.5 flex items-center justify-center gap-1.5 pointer-events-none">
          <div className="h-1.5 w-4 rounded-full bg-[#F8EA25]" />
          <div className="size-1.5 rounded-full bg-[#333333]" />
        </div>
      </div>

      {/* 2. 快捷操作与筛选栏 (Figma y=256: 热门 / 热搜 / 切换视图 / 筛选) */}
      <div className="flex items-center justify-between gap-2">
        {/* 左侧：热门下拉选择 (Figma Group 260: w=92, h=28) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsFilterDropdownOpen((prev) => !prev)}
            className="flex h-7 items-center gap-1 rounded border border-[#FE810B]/60 bg-[#FD810B1A] px-2.5 text-xs text-[#FB5F16] transition-all active:translate-y-0.5"
          >
            <Flame className="size-3.5 text-[#FB5F16]" />
            <span className="font-medium">{activeFilter}</span>
            <ChevronDown className="size-3 text-[#FB5F16]" />
          </button>

          {isFilterDropdownOpen && (
            <div className="absolute left-0 top-full z-40 mt-1 flex w-24 flex-col rounded border border-white/10 bg-[#141517] p-1 shadow-xl">
              {filterOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setActiveFilter(opt)
                    setIsFilterDropdownOpen(false)
                  }}
                  className={`flex w-full items-center px-2 py-1.5 text-left text-xs rounded transition-colors ${
                    activeFilter === opt
                      ? 'bg-white/10 font-bold text-[#FB5F16]'
                      : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 右侧控制组：热搜 / 视图切换 / 筛选 */}
        <div className="flex items-center gap-2">
          {/* 热搜按钮 (Figma Rectangle 6 + 热搜: w=56, h=28) */}
          <button
            type="button"
            onClick={() => setIsSearchOpen((prev) => !prev)}
            className="flex h-7 items-center gap-1 rounded border border-white/10 bg-black px-2.5 text-xs text-white transition-all hover:bg-white/5 active:translate-y-0.5"
          >
            <Search className="size-3.5 text-white" />
            <span>热搜</span>
          </button>

          {/* 列表/网格视图切换 (Figma Group 18: w=56, h=28) */}
          <div className="flex h-7 items-center divide-x divide-white/10 rounded border border-white/10 bg-black">
            <button
              type="button"
              aria-label="列表视图"
              onClick={() => setViewMode('list')}
              className={`flex size-7 items-center justify-center transition-colors ${
                viewMode === 'list' ? 'text-[#FB5F16]' : 'text-neutral-500'
              }`}
            >
              <AlignJustify className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="网格视图"
              onClick={() => setViewMode('grid')}
              className={`flex size-7 items-center justify-center transition-colors ${
                viewMode === 'grid' ? 'text-[#FB5F16]' : 'text-neutral-500'
              }`}
            >
              <Grid2X2 className="size-3.5" />
            </button>
          </div>

          {/* 筛选按钮 (Figma Rectangle 7: w=28, h=28) */}
          <button
            type="button"
            aria-label="更多筛选"
            className="flex size-7 items-center justify-center rounded border border-white/10 bg-black text-white transition-colors hover:bg-white/5"
          >
            <SlidersHorizontal className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 搜索展开栏 */}
      {isSearchOpen && (
        <div className="relative flex items-center">
          <Search className="absolute left-3 size-3.5 text-neutral-500" />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索代币名称、符号或合约地址..."
            className="h-8 w-full rounded border border-[#484b51] bg-[#131516] pl-8 pr-8 text-xs text-white placeholder:text-neutral-500 focus:border-[#FE810B] focus:outline-none"
          />
          {searchKeyword && (
            <button
              type="button"
              onClick={() => setSearchKeyword('')}
              className="absolute right-2.5 text-neutral-400 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {/* 3. 代币列表展示 (Figma 1-0 首页-列展示: Rectangle 8: 343x453) */}
      <div className="w-full overflow-hidden rounded-md border border-white/10 bg-black">
        {/* 表头导航栏 (Figma Rectangle 9: h=37, bg #141517) */}
        <div className="flex h-9 items-center justify-between border-b border-white/10 bg-[#141517] px-3 text-xs text-white/80">
          <div className="flex items-center gap-3">
            <span>市值/发行量</span>
            <span>税率</span>
          </div>
          <div className="flex items-center gap-4 text-right">
            <span>价格</span>
            <span className="w-20 text-right">涨幅</span>
          </div>
        </div>

        {/* 列表条目 (Figma Repeating Rows: 32px Avatar + UTILITY + $6.91M / $17.77M 1%/1% + $0.0069... + +1783.38%) */}
        <div className="divide-y divide-white/10">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="size-8 shrink-0 animate-pulse rounded-sm bg-[#2F3737]" />
                  <div className="flex flex-col gap-1.5">
                    <div className="h-3 w-20 animate-pulse rounded bg-[#2F3737]" />
                    <div className="h-2.5 w-32 animate-pulse rounded bg-[#2F3737]" />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="h-3 w-14 animate-pulse rounded bg-[#2F3737]" />
                  <div className="h-5 w-16 animate-pulse rounded bg-[#2F3737]" />
                </div>
              </div>
            ))
          ) : isError ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-xs text-neutral-500">
              <Coins className="mb-2 size-6 text-neutral-600" />
              <span>加载失败，请稍后重试</span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-3 rounded border border-[#FE810B]/60 bg-[#FD810B1A] px-4 py-1.5 text-xs font-medium text-[#FB5F16] transition-all hover:bg-[#FD810B33] active:translate-y-0.5"
              >
                重新加载
              </button>
            </div>
          ) : displayedTokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-xs text-neutral-500">
              <Coins className="size-6 mb-2 text-neutral-600" />
              <span>{searchKeyword ? '暂无匹配代币' : '暂无代币数据'}</span>
            </div>
          ) : (
            displayedTokens.map((token) => {
              const changePercent = getChangePercent(token)
              const isPositive = changePercent >= 0
              return (
                <div
                  key={token.id}
                  className="flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-white/5 cursor-pointer"
                >
                  {/* 左侧：Logo 与代币名称/市值明细 */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="size-8 shrink-0 overflow-hidden rounded-sm border border-white/30 bg-[#1a1c1e] flex items-center justify-center">
                      {getTokenLogo(token) ? (
                        <img
                          src={getTokenLogo(token)}
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
                    <div className="flex flex-col min-w-0">
                      <span className="truncate text-xs font-bold text-[#F0F0F0] leading-tight">
                        {token.name}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] text-white/60 leading-normal">
                        <span>{formatUsd(token.marketCap)}</span>
                        <span>/</span>
                        <span>{totalSupplyText}</span>
                        <span className="ml-1 text-white/70">
                          {token.buyTax}%/{token.sellTax}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 右侧：价格与涨跌幅徽标 */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs font-bold text-[#AAAAAA]">
                      {formatPrice(token.tradePrice)}
                    </span>
                    <div className="w-20 flex justify-end">
                      <span
                        className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-mono font-bold leading-none ${
                          isPositive
                            ? 'bg-[#0ECB81] text-white'
                            : 'bg-[#F6465D] text-white'
                        }`}
                      >
                        {formatChange(changePercent)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
