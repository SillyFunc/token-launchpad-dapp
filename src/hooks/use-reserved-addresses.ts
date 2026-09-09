import { useQuery } from '@tanstack/react-query'
import { isAddress, type Hex } from 'viem'
import { useConnection } from 'wagmi'

import {
  getReservedAddressListByUser,
  type ReservedAddressStatus,
} from '@/api/token'

export interface ReservedAddress {
  token: Hex
  status: ReservedAddressStatus
}

function isReservedAddressStatus(value: unknown): value is ReservedAddressStatus {
  return value === 0 || value === 1 || value === 2
}

/**
 * 预留地址和对应盐值会在锁定成功后同步保存到平台服务端。
 * 以接口为列表来源，避免浏览器本地存储、RPC 历史日志深度和不同域名之间的差异影响展示。
 */
async function fetchReservedAddresses(reserver: Hex): Promise<ReservedAddress[]> {
  const records = await getReservedAddressListByUser(reserver)
  const seen = new Set<string>()

  return records.flatMap(({ contractAddress, status }) => {
    if (!isAddress(contractAddress) || !isReservedAddressStatus(status)) return []

    const token = contractAddress as Hex
    const key = token.toLowerCase()
    if (seen.has(key)) return []

    seen.add(key)
    return [{ token, status }]
  })
}

/** 当前连接钱包的预留地址列表，从平台接口读取。 */
export function useReservedAddresses() {
  const { address } = useConnection()

  const query = useQuery({
    queryKey: ['reserved-addresses', address ?? ''],
    queryFn: () => fetchReservedAddresses(address as Hex),
    enabled: Boolean(address),
    staleTime: 30_000,
  })

  return {
    ...query,
    addresses: query.data ?? [],
  }
}
