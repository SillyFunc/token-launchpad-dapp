import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { isAddress, isHash, type Hex } from 'viem'

import type { TokenDetail } from '@/api/token'
import { DEFAULT_CHAIN_ID, getExplorerUrl } from '@/config/network'
import {
  formatAddress,
  formatNumber,
  formatPercent,
  formatTokenSupply,
} from '@/lib/format'
import type { Locale } from '@/lib/i18n'
import { getReadClient } from '@/lib/pricing'

interface TokenInfoProps {
  token?: TokenDetail
  totalSupply: bigint
  marketCapBNB: number | null
  changePercent: number | null
  locale: Locale
}

function InfoSectionTitle({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1 text-sm text-foreground">
        <svg
          viewBox="0 0 4.5 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="size-3.5 shrink-0"
        >
          <path
            d="M4.25 0.5H0.5V13.5H4.25"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
        <span>{title}</span>
        <svg
          viewBox="0 0 4.5 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="size-3.5 shrink-0 -scale-x-100"
        >
          <path
            d="M4.25 0.5H0.5V13.5H4.25"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
      </h2>
      {children}
    </section>
  )
}

function InfoRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="shrink-0 text-[#A0A3A7]">{label}</span>
      <span className="min-w-0 text-right text-foreground">{children}</span>
    </div>
  )
}

function formatCreatedAt(value: unknown, locale: Locale): string {
  if (value === null || value === undefined || value === '') return '--'

  const numericValue = Number(value)
  const date = Number.isFinite(numericValue)
    ? new Date(
        numericValue < 10_000_000_000 ? numericValue * 1_000 : numericValue,
      )
    : new Date(String(value))

  if (Number.isNaN(date.getTime())) return '--'

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function TokenInfo({
  token,
  totalSupply,
  marketCapBNB,
  changePercent,
  locale,
}: TokenInfoProps) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const creationTxHash =
    typeof token?.hash === 'string' && isHash(token.hash)
      ? (token.hash as Hex)
      : undefined

  const {
    data: creationTimestamp,
    isLoading: isCreationTimeLoading,
  } = useQuery({
    queryKey: ['tokenCreationTimestamp', DEFAULT_CHAIN_ID, creationTxHash],
    queryFn: async () => {
      const client = getReadClient()
      const receipt = await client.getTransactionReceipt({
        hash: creationTxHash!,
      })
      const block = await client.getBlock({ blockNumber: receipt.blockNumber })
      return block.timestamp
    },
    enabled: Boolean(creationTxHash),
    staleTime: Infinity,
    retry: 1,
  })

  const description = token?.meta || token?.zhIntroduction || '暂无代币描述'
  const creatorAddress = token?.creatorAddress || ''
  const feeRecipient = token?.feeRecipient || ''
  const creatorExplorerUrl = isAddress(creatorAddress)
    ? getExplorerUrl(creatorAddress, 'address')
    : undefined
  const feeRecipientExplorerUrl = isAddress(feeRecipient)
    ? getExplorerUrl(feeRecipient, 'address')
    : undefined
  const supplyText =
    totalSupply > 0n ? formatTokenSupply(totalSupply, locale) : '--'
  const marketCapText =
    marketCapBNB === null ? '--' : `${formatNumber(marketCapBNB, locale)} BNB`
  const changeText =
    changePercent === null ? '--' : formatPercent(changePercent)
  const createdAtText = isCreationTimeLoading
    ? '加载中…'
    : formatCreatedAt(creationTimestamp, locale)
  const changeClass =
    changePercent === null
      ? 'text-foreground'
      : changePercent >= 0
        ? 'text-[#0ECB81]'
        : 'text-[#F7594B]'
  const mediaLinks = [
    { label: '官网', href: token?.website },
    { label: 'Telegram', href: token?.telegram },
    { label: 'X / Twitter', href: token?.twitter },
  ].filter((item) => Boolean(item.href))

  const handleCopy = async (address?: string) => {
    if (!address || !navigator.clipboard) return

    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(address)
      window.setTimeout(() => setCopiedAddress(null), 2_000)
    } catch {
      setCopiedAddress(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <InfoSectionTitle title="描述">
        <p className="min-w-0 max-w-full wrap-break-word text-xs leading-5 text-[#A0A3A7]">
          {description}
        </p>
      </InfoSectionTitle>

      <InfoSectionTitle title="代币信息">
        <div className="flex flex-col gap-3">
          <InfoRow label="相对预售价涨幅">
            <span className={changeClass}>{changeText}</span>
          </InfoRow>
          <InfoRow label="24H 交易额">--</InfoRow>
          <InfoRow label="LIQ">--</InfoRow>
          <InfoRow label="市值">{marketCapText}</InfoRow>
          <InfoRow label="持有人">--</InfoRow>
          <InfoRow label="FDV">{marketCapText}</InfoRow>
          <InfoRow label="最大供应量">{supplyText}</InfoRow>
          <InfoRow label="创建时间">{createdAtText}</InfoRow>
          <InfoRow label="创建者">
            <span className="inline-flex items-center gap-1">
              <button
                type="button"
                aria-label="复制创建者地址"
                disabled={!creatorAddress}
                onClick={() => void handleCopy(creatorAddress)}
                className="inline-flex items-center gap-1 underline underline-offset-2 transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
              >
                {formatAddress(creatorAddress)}
                {copiedAddress === creatorAddress ? (
                  <Check className="size-3 text-[#0ECB81]" />
                ) : (
                  <Copy className="size-3" />
                )}
              </button>
              {creatorExplorerUrl && (
                <a
                  href={creatorExplorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="在区块浏览器中查看创建者地址"
                  className="text-[#A0A3A7] transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
                >
                  <ExternalLink className="size-3" />
                </a>
              )}
            </span>
          </InfoRow>
          <InfoRow label="买入税率">
            {token ? `${token.buyTax ?? 0}%` : '--'}
          </InfoRow>
          <InfoRow label="卖出税率">
            {token ? `${token.sellTax ?? 0}%` : '--'}
          </InfoRow>
          <InfoRow label="税费存续期">
            {token?.taxDuration ? `${token.taxDuration} 天` : '--'}
          </InfoRow>
          <InfoRow label="防夹/砸盘保护期">
            {token?.antiFarmerDuration !== undefined &&
            token?.antiFarmerDuration !== null
              ? `${token.antiFarmerDuration} 天`
              : '--'}
          </InfoRow>
          <InfoRow label="税费接收地址">
            <span className="inline-flex items-center gap-1">
              <button
                type="button"
                aria-label="复制税费接收地址"
                disabled={!feeRecipient}
                onClick={() => void handleCopy(feeRecipient)}
                className="inline-flex items-center gap-1 underline underline-offset-2 transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
              >
                {formatAddress(feeRecipient)}
                {copiedAddress === feeRecipient ? (
                  <Check className="size-3 text-[#0ECB81]" />
                ) : (
                  <Copy className="size-3" />
                )}
              </button>
              {feeRecipientExplorerUrl && (
                <a
                  href={feeRecipientExplorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="在区块浏览器中查看税费接收地址"
                  className="text-[#A0A3A7] transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
                >
                  <ExternalLink className="size-3" />
                </a>
              )}
            </span>
          </InfoRow>
        </div>
      </InfoSectionTitle>

      <InfoSectionTitle title="媒体信息">
        {mediaLinks.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {mediaLinks.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-sm border border-foreground/10 bg-foreground/5 px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-primary/50 hover:text-primary focus-visible:border-primary focus-visible:text-primary focus-visible:outline-none"
              >
                {label}
                <ExternalLink className="size-3" />
              </a>
            ))}
          </div>
        ) : (
          <span className="text-xs text-[#A0A3A7]">暂无媒体信息</span>
        )}
      </InfoSectionTitle>
    </div>
  )
}
