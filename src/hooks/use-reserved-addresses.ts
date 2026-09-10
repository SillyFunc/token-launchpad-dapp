import { useQuery } from '@tanstack/react-query'
import { useConnection } from 'wagmi'

import { getReservedAddressListByUser } from '@/api/token'

/** 当前连接钱包的预留地址列表，从平台接口读取。 */
export function useReservedAddresses() {
  const { address } = useConnection()

  const query = useQuery({
    queryKey: ['reserved-addresses', address ?? ''],
    queryFn: () => getReservedAddressListByUser(address!),
    enabled: Boolean(address),
    staleTime: 0,
  })

  return {
    ...query,
    addresses: query.data ?? [],
  }
}
