import { signMessage } from '@wagmi/core'
import type { Config } from 'wagmi'

import { post } from '@/lib/request'
import type { AxiosRequestConfig } from 'axios'

export function register(address: string, config?: AxiosRequestConfig) {
  return post('deposit/bttk/enter', { address }, config)
}

export function getSignMessage(address: string, config?: AxiosRequestConfig) {
  return post<string>('deposit/project/getChainSignNonce', { address }, config)
}

export interface AuthSignature {
  address: string
  message: string
  signature: string
}

/** 统一获取签名 Nonce 并唤起钱包签名，返回标准鉴权载荷 */
export async function requestAuthSignature(
  config: Config,
  address: string,
): Promise<AuthSignature> {
  const message = await getSignMessage(address)
  const signature = await signMessage(config, { message })
  return { address, message, signature }
}
