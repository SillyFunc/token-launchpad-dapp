import {
  DEFAULT_CHAIN_ID,
  CHAINS_CONFIG,
  getContractAddresses as getAddresses,
  type ChainMetadata,
} from '@/config/network'

export { DEFAULT_CHAIN_ID }

export const CONTRACT_ADDRESSES = {
  97: CHAINS_CONFIG[97].contracts,
  56: CHAINS_CONFIG[56].contracts,
} as const satisfies Record<number, Record<string, `0x${string}`>>

export type ChainId = keyof typeof CONTRACT_ADDRESSES

export function getContractAddresses(chainId: number = DEFAULT_CHAIN_ID) {
  return getAddresses(chainId)
}
