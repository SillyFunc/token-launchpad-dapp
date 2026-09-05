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

/**
 * 数值 → 无科学计数法、无浮点噪声的十进制字符串（修剪尾随 0），非法输入返回 '--'。
 * 后端数值字段经 JSON number 返回时，极小值（如 2e-10）经 String() 会变成
 * 科学计数法；而直接 toFixed(18) 又会暴露二进制浮点噪声（如 0.1 → 0.100000000000000006）。
 * 先按有效数字取整消噪，再展开为普通十进制。
 */
export function formatDecimalText(
  value: string | number | null | undefined,
  maxSignificantDigits = 12,
): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '--'
  if (n === 0) return '0'
  const cleaned = Number(n.toPrecision(maxSignificantDigits))
  const decimals = Math.min(
    20,
    Math.max(
      0,
      maxSignificantDigits - 1 - Math.floor(Math.log10(Math.abs(cleaned))),
    ),
  )
  const text = cleaned.toFixed(decimals)
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text
}

/** 美元金额（紧凑格式，跟随语言环境） */
export function formatUsd(
  value: number | string | null | undefined,
  locale: Locale = 'zh-TW',
): string {
  const num = toNumber(value)
  if (num === null || num === 0) return '--'
  return getCompactUsdFormatter(locale).format(num)
}

/** 通用数量（紧凑格式，跟随语言环境） */
export function formatNumber(
  value: number | string | null | undefined,
  locale: Locale = 'zh-TW',
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