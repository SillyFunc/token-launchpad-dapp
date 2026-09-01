import { post } from '@/lib/request'
import type { AxiosRequestConfig } from 'axios'

export interface SaveTokenData {
  name: string
  coinImg: string
  symbol: string
  meta: string
  buyTax: number
  sellTax: number
  feeRecipient: string
  taxDuration: number
  antiFarmerDuration: number
  liqExpectedOutputAmount: number
  salt?: string
  creationFee?: number
  launchType: number
  website: string
  telegram: string
  twitter: string
  address: string
  message: string
  signature: string
}

export interface TokenDetail {
  id: number
  hash: any
  name: string
  address: string
  creatorAddress: string
  contractAddress: any
  coinContractAddress: any
  chatAt: any
  unit: any
  minTxFee: any
  maxTxFee: any
  marketCap: number
  feeLogicType: number
  secretAddress: any
  fullName: any
  coinPrecision: any
  coinImg: string
  issuePrice: number
  totalIssuance: number
  calculationRate: number
  issuanceCycle: any
  issuer: any
  officialWebsite: any
  whitePaperLink: any
  contractInformation: any
  releaseDeclaration: any
  minHoldBalance: number
  status: number
  coinStatus: number
  auditRemark: any
  auditTime: any
  createTime: any
  realPrice: number
  feeRecipient: string
  network: any
  tradePrice: number
  totalSupply: any
  maxTotalNum: any
  softCapRate: any
  presaleMaxNum: any
  insideMaxNum: any
  backingReceiver: any
  burnLimit: number
  startTime: any
  endTime: any
  lgeCopies: any
  rate: number
  vestingDis: any
  hardcap: any
  softcap: any
  tokenAmount: any
  maxBuyPerWallet: number
  vestingDelay: any
  vestingRate: any
  backingShare: any
  userLpShare: any
  devLpShare: any
  devLpReceiver: any
  basePresaleCount: any
  website: string
  telegram: string
  twitter: string
  withdrawFeeRate: number
  pledgeContractAddress: any
  minWithdrawAmount: number
  maxWithdrawAmount: number
  zhIntroduction: any
  enIntroduction: any
  thb: any
  soft: any
  remainSupply: any
  domesticPrice: number
  presaleAddress: any
  top: any
  isInternalExchange: number
  launchType: number
  canSwap: number
  tradeAddress: any
  backingPoolAddress: any
  symbol: string
  meta: string
  buyTax: number
  sellTax: number
  taxDuration: number
  antiFarmerDuration: number
  liqExpectedOutputAmount: string
  salt: any
  creationFee: any
  presaleTokenPrice: any
  minLiquidityAmount: any
  slippage: any
  creatorBuyTokens: any
}

export function uploadTokenLogo(file: File) {
  return post<string>('deposit/common/upload/local/image', { file })
}

export function saveTokenInfo(
  data: SaveTokenData,
  config?: AxiosRequestConfig,
): Promise<void> {
  return post<void>('deposit/exSwap/swapCoinIssuedAdd', data, config)
}

export function updateTokenInfo(
  data: { id: number | string } & SaveTokenData,
  config?: AxiosRequestConfig,
): Promise<void> {
  return post<void>(
    'deposit/exSwap/swapCoinIssuedUpdateCoinssued',
    data,
    config,
  )
}

export interface ParseTxHashData {
  id: number | string
  hash: string
  address: string
  message: string
  signature: string
}

export function parseTxHash(
  data: ParseTxHashData,
  config?: AxiosRequestConfig,
) {
  return post('deposit/exSwap/swapCoinIssuedUpdate', data, config)
}

export function getTokensByCreator(
  address: string,
  config?: AxiosRequestConfig,
) {
  return post<any[]>('deposit/exSwap/swapIssuedList', { address }, config)
}

export function getTokenByContractAddress(
  address: string,
  config?: AxiosRequestConfig,
) {
  return post<TokenDetail>(
    'deposit/exSwap/swapCoinIssuedDetail',
    { address },
    config,
  )
}

export interface PresaleConfigPayload {
  presaleTokenPrice: string
  maxBuyPerWallet: string
  hardcap: string
  minLiquidityAmount: string
  softCap: string
  startTime: number
  vestingDelay: number
  vestingRate: number
  slippage: number
  creatorBuyTokens: string
}

export interface SavePresaleData {
  token: string
  presaleConfig: PresaleConfigPayload
  creatorBuyBnb: string
  address?: string
  message?: string
  signature?: string
}

export function savePresaleInfo(
  data: SavePresaleData,
  config?: AxiosRequestConfig,
): Promise<void> {
  return post<void>('deposit/exSwap/swapPresaleAdd', data, config)
}

export function getPopularTokens(config?: AxiosRequestConfig) {
  return post('deposit/exSwap/swapCoinIssuedList', {}, config)
}
