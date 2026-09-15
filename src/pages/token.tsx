import { useState } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useReadContract } from 'wagmi'
import { isAddress, type Hex } from 'viem'
import { Check, Coins, Copy, ExternalLink } from 'lucide-react'

import { getTokenByContractAddress } from '@/api/token'
import { TokenChart } from '@/components/token/token-chart'
import { TokenInfo } from '@/components/token/token-info'
import { TokenLayout } from '@/components/token/token-layout'
import { TokenPresale } from '@/components/token/token-presale'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { FlapTaxTokenV3Abi } from '@/contracts/abi'
import { DEFAULT_CHAIN_ID, getExplorerUrl } from '@/config/network'
import {
  formatAddress,
  formatDecimalText,
  formatNumber,
  formatPercent,
  formatTokenSupply,
} from '@/lib/format'
import { useLocale } from '@/lib/i18n'
import { useTokenGate } from '@/hooks/use-token-gate'
import { useTokenPrice } from '@/hooks/use-token-price'

type TabType = 'PRESALE' | 'CHART' | 'INFO'

const tabCommonClass = 'relative pb-1 cursor-pointer transition-colors'
const tabLineClass =
  'absolute bottom-0 left-1/2 w-3 h-0.5 -translate-x-1/2 bg-foreground'

export const Token = () => {
  const { address: routeAddress = '' } = useParams<{ address: string }>()
  const { locale } = useLocale()
  const [activeTab, setActiveTab] = useState<TabType>('PRESALE')
  const [copied, setCopied] = useState(false)

  const tokenAddress = isAddress(routeAddress)
    ? (routeAddress.toLowerCase() as Hex)
    : undefined

  const {
    data: token,
    isLoading: isTokenLoading,
    isError: isTokenError,
  } = useQuery({
    queryKey: ['tokenDetail', tokenAddress],
    queryFn: () => getTokenByContractAddress(tokenAddress!),
    enabled: Boolean(tokenAddress),
    staleTime: 30_000,
  })

  const { data: totalSupplyData } = useReadContract({
    address: tokenAddress,
    abi: FlapTaxTokenV3Abi,
    functionName: 'totalSupply',
    chainId: DEFAULT_CHAIN_ID,
    query: {
      staleTime: 0,
      enabled: Boolean(tokenAddress),
    },
  })
  const totalSupply = (totalSupplyData as bigint | undefined) ?? 0n
  const {
    priceBNB,
    mcapBNB,
    changePercent,
    pairAddress,
  } = useTokenPrice(tokenAddress ?? '', totalSupply)
  const {
    isChainLoading: isTokenStateLoading,
    presaleConfigured,
    presaleEnabled,
    presaleStatus,
    tokenState,
  } = useTokenGate({
    tokenAddress,
    token,
  })

  const isLaunched = (tokenState ?? 0) >= 2 || presaleStatus === 3
  const hasPresale = presaleConfigured || presaleEnabled
  const visibleTabs: Array<{ value: TabType; label: string }> =
    isTokenStateLoading
      ? [{ value: 'INFO', label: '信息' }]
      : isLaunched
        ? [
            { value: 'CHART', label: '图表' },
            { value: 'INFO', label: '信息' },
          ]
        : hasPresale
          ? [
              { value: 'PRESALE', label: '预售' },
              { value: 'INFO', label: '信息' },
            ]
          : [{ value: 'INFO', label: '信息' }]
  const displayedTab = visibleTabs.some((tab) => tab.value === activeTab)
    ? activeTab
    : visibleTabs[0].value

  const tokenName = !tokenAddress
    ? '无效的合约地址'
    : isTokenLoading
      ? '加载中…'
      : token?.name || (isTokenError ? '代币信息加载失败' : '未找到代币')
  const tokenSymbol = token?.symbol ? `$${token.symbol}` : '--'
  const explorerUrl = tokenAddress
    ? getExplorerUrl(tokenAddress, 'address')
    : undefined
  const externalUrl = token?.website || explorerUrl
  const priceText =
    priceBNB === null ? '--' : `${formatDecimalText(priceBNB)} BNB`
  const changeText =
    changePercent === null ? '--' : formatPercent(changePercent)
  const supplyText =
    totalSupply > 0n ? formatTokenSupply(totalSupply, locale) : '--'
  const marketCapText =
    mcapBNB === null ? '--' : `${formatNumber(mcapBNB, locale)} BNB`

  const handleCopy = async () => {
    if (!tokenAddress || !navigator.clipboard) return

    try {
      await navigator.clipboard.writeText(tokenAddress)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <TokenLayout>
      <header className="shrink-0 bg-[#070808] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-9.5 bg-[#141517] after:border-foreground/10">
              <AvatarImage src={token?.coinImg || undefined} alt={tokenName} />
              <AvatarFallback className="bg-[#141517] text-[#FFA546]">
                <Coins className="size-5 text-[#FFA546]" aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-white">
                {tokenSymbol}
              </span>
              {externalUrl ? (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`打开 ${tokenName} 的${token?.website ? '官网' : '区块浏览器页面'}`}
                  className="group mt-1 flex items-center gap-1 truncate text-xs text-[#A0A3A7] focus-visible:outline-none"
                >
                  <span className="truncate leading-none">{tokenName}</span>
                  <ExternalLink className="size-3.5 shrink-0 transition-colors group-hover:text-[#FFA546] group-focus-visible:text-[#FFA546]" />
                </a>
              ) : (
                <span className="mt-1 truncate text-xs leading-none text-[#A0A3A7]">
                  {tokenName}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col text-right">
            <span className="text-base font-semibold text-foreground">
              {priceText}
            </span>
            <span
              className={
                changePercent === null
                  ? 'text-xs text-[#A0A3A7]'
                  : changePercent >= 0
                    ? 'text-xs text-[#0ECB81]'
                    : 'text-xs text-[#F7594B]'
              }
            >
              {changeText}
            </span>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2 text-xs font-normal">
          <div className="flex items-center">
            <svg
              viewBox="0 0 4.5 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className="size-3 shrink-0 text-[#A0A3A7]"
            >
              <path
                d="M4.25 0.5H0.5V13.5H4.25"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
            <div className="mx-1 flex items-center text-xs">
              <span className="mr-1 text-[#A0A3A7]">CA</span>
              <button
                type="button"
                aria-label="复制代币合约地址"
                disabled={!tokenAddress}
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1 text-foreground underline underline-offset-2 transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
              >
                {formatAddress(tokenAddress)}
                {copied ? (
                  <Check className="ml-1 size-3 text-[#0ECB81]" />
                ) : (
                  <Copy className="ml-1 size-3" />
                )}
              </button>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="在区块浏览器中查看代币合约"
                  className="ml-1 text-[#A0A3A7] transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
                >
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <svg
              viewBox="0 0 4.5 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className="size-3 shrink-0 -scale-x-100 text-[#A0A3A7]"
            >
              <path
                d="M4.25 0.5H0.5V13.5H4.25"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-5 divide-x divide-foreground/10 border-t border-t-foreground/5 pt-3 text-center text-xs">
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-[#84888C]">发行量</span>
            <span className="truncate text-foreground">{supplyText}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-[#84888C]">24H 交易额</span>
            <span className="text-foreground">--</span>
          </div>
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-[#84888C]">市值</span>
            <span className="truncate text-foreground">{marketCapText}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-[#84888C]">持有人</span>
            <span className="text-foreground">--</span>
          </div>
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-[#84888C]">税率</span>
            <span className="truncate text-foreground">
              {token ? `${token.buyTax ?? 0}% / ${token.sellTax ?? 0}%` : '--'}
            </span>
          </div>
        </div>
      </header>

      <div className="relative mt-4 px-4">
        <div
          role="tablist"
          aria-label="代币详情内容"
          className="flex items-center gap-4 border-b border-b-[#484B51] text-sm font-semibold"
        >
          {visibleTabs.map(({ value: tab, label }) => {
            const isActive = displayedTab === tab

            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`${tabCommonClass} ${isActive ? 'text-foreground' : 'text-[#A0A3A7]'}`}
                onClick={() => setActiveTab(tab)}
              >
                {label}
                {isActive && (
                  <span aria-hidden="true" className={tabLineClass} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <main className="px-4 pt-6">
        {displayedTab === 'PRESALE' && (
          <TokenPresale
            token={token}
            tokenAddress={tokenAddress}
            locale={locale}
          />
        )}
        {displayedTab === 'CHART' && (
          <TokenChart
            tokenAddress={tokenAddress}
            pairAddress={pairAddress}
          />
        )}
        {displayedTab === 'INFO' && (
          <TokenInfo
            token={token}
            totalSupply={totalSupply}
            marketCapBNB={mcapBNB}
            changePercent={changePercent}
            locale={locale}
          />
        )}
      </main>
    </TokenLayout>
  )
}
