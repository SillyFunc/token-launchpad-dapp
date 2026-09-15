import { get } from '@/lib/request'
import type { AxiosRequestConfig } from 'axios'

/** 认购支付状态：0-确认中 1-成功 2-失败 */
export type BuyRecordStatus = 0 | 1 | 2

/**
 * 认购记录（deposit/buyTokenRecord）。
 * 实测后端口径：payAmount/preAmount 为 BigDecimal 序列化的 JSON number，
 * createTime 为 "yyyy-MM-dd HH:mm:ss" 字符串，txHash/preIndex/blockNumber 可空。
 */
export interface BuyTokenRecord {
  id: number
  memberId: number
  /** 支付用户地址 */
  address: string
  /** 支付数量 */
  payAmount: string | number
  /** 支付币种 */
  payCoin: string
  status: BuyRecordStatus
  txHash: string | null
  /** 链上序列号 */
  preIndex: number | null
  remark: string | null
  createTime: string
  updateTime: string
  /** 预售合约地址 */
  contractAddress: string
  /** 链上时间戳 */
  sequences: number
  /** 预售币种符号 */
  preCoin: string
  /** 认购到的代币数量 */
  preAmount: string | number
  blockNumber: number | null
  /** 链上预售状态（与合约 presaleStatus 一致：0 配置期 1 认购中 2 待开盘 3 已开盘 4 已失败） */
  presaleStatus: number
}

/**
 * 分页结果（Spring Page 序列化）。
 * 注意请求/响应页码口径不一致：请求 pageNo 为 1-based，响应 number 为 0-based。
 */
export interface BuyTokenRecordPage {
  content: BuyTokenRecord[]
  /** 0-based 当前页码 */
  number: number
  size: number
  totalElements: number
  totalPages: number
}

export interface BuyTokenRecordQuery {
  /** 支付用户地址（可选；后端大小写不敏感，实测小写可命中） */
  address?: string
  /** 预售合约地址（可选） */
  presaleAddress?: string
  /** 页码，1-based */
  pageNo: number
  pageSize: number
}

export function getBuyTokenRecordPage(
  query: BuyTokenRecordQuery,
  config?: AxiosRequestConfig,
): Promise<BuyTokenRecordPage> {
  return get('deposit/buyTokenRecord/presalePage', { ...query }, config)
}
