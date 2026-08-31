import { post } from '@/lib/request'
import type { AxiosRequestConfig } from 'axios'

export function register(address: string, config?: AxiosRequestConfig) {
  return post('deposit/bttk/enter', { address }, config)
}

export function getSignMessage(address: string, config?: AxiosRequestConfig) {
  return post<string>('deposit/project/getChainSignNonce', { address }, config)
}
