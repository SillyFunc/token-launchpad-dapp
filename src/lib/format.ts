import { formatUnits } from 'viem'

import type { Locale } from './i18n'

const compactUsdFormatters: Partial<Record<Locale, Intl.NumberFormat>> = {}
const compactNumberFormatters: Partial<Record<Locale, Intl.NumberFormat>> = {}

function getCompactUsdFormatter(locale: Locale): Intl.NumberFormat {
  if (!compactUsdFormatters[locale]) {
    compactUsdFormatters[locale] = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 2,
    })
  }
  return compactUsdFormatters[locale]!
}

function getCompactNumberFormatter(locale: Locale): Intl.NumberFormat {
  if (!compactNumberFormatters[locale]) {
    compactNumberFormatters[locale] = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 2,
    })
  }
  return compactNumberFormatters[locale]!
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/** 地址缩写：0x1234...abcd */
export function formatAddress(addr?: string | null): string {
  if (!addr) return '--'
  if (addr.length <= 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/** 美元金额（紧凑格式，跟随语言环境） */
export function formatUsd(
  value: number | string | null | undefined,
  locale: Locale,
): string {
  const num = toNumber(value)
  if (num === null || num === 0) return '--'
  return getCompactUsdFormatter(locale).format(num)
}

/** 通用数量（紧凑格式，跟随语言环境） */
export function formatNumber(
  value: number | string | null | undefined,
  locale: Locale,
): string {
  const num = toNumber(value)
  if (num === null || num === 0) return '--'
  return getCompactNumberFormatter(locale).format(num)
}

/** 带正负号的百分比，如 +1783.38% / -12.34% */
export function formatPercent(value: number | null | undefined): string {
  const num = toNumber(value)
  if (num === null) return '0.00%'
  return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`
}

/** 链上代币发行量（默认 18 位精度，跟随语言环境） */
export function formatTokenSupply(
  supply: bigint,
  locale: Locale,
  decimals = 18,
): string {
  return getCompactNumberFormatter(locale).format(
    Number(formatUnits(supply, decimals)),
  )
}