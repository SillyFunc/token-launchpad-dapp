import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useConnection } from 'wagmi'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getReservedAddressListByUser,
  type ReservedAddressStatus,
} from '@/api/token'

/** 用户已锁定的预留 CA */
export interface ReservedAddressOption {
  /** 预留的代币合约地址 */
  address: string
  /** 兑现该地址时 createToken 所需的盐值 */
  salt: string
  /** 接口返回的代币状态：0 未使用；1 已占用；2 已使用 */
  coinStatus: ReservedAddressStatus
}

/** 预留地址统一 8888 尾号，缩写时需保留更长的头尾以便区分 */
const shortReservedAddress = (addr: string) =>
  `${addr.slice(0, 10)}…${addr.slice(-8)}`

/** 「不使用预留地址」占位值：base-ui Select 用 null 表示未选，这里映射为 '' 便于匹配 */
const NO_RESERVED_ADDRESS = ''

const RESERVED_STATUS_LABEL: Record<ReservedAddressStatus, string> = {
  0: '未使用',
  1: '已占用',
  2: '已使用',
}

/**
 * 接口可能将状态序列化为数字或字符串；只有明确的 0/1/2 才接受，
 * 其他异常值按已使用处理，避免未知状态被误选。
 */
function normalizeStatus(value: unknown): ReservedAddressStatus {
  const status =
    typeof value === 'string' && /^[012]$/.test(value) ? Number(value) : value
  return status === 0 || status === 1 || status === 2 ? status : 2
}

/** 当前钱包在服务端登记的预留地址列表（含盐值和状态）。 */
export function useReservedAddressOptions() {
  const { address } = useConnection()

  return useQuery({
    queryKey: ['reserved-address-list', address ?? ''],
    queryFn: async () => {
      const list = await getReservedAddressListByUser(address!)
      return list.map<ReservedAddressOption>((item) => {
        // status 是预留记录状态；coinStatus 才是地址是否可发行的状态。
        const coinStatus = normalizeStatus(item.coinStatus)
        return {
          address: item.contractAddress,
          salt: item.salt,
          coinStatus,
        }
      })
    },
    enabled: Boolean(address),
    staleTime: 30_000,
  })
}

export interface ReservedAddressSelectProps {
  id?: string
  name?: string
  value: ReservedAddressOption | null
  onChange: (value: ReservedAddressOption | null) => void
  onBlur?: () => void
}

export function ReservedAddressSelect({
  id,
  name,
  value,
  onChange,
  onBlur,
}: ReservedAddressSelectProps) {
  const { address } = useConnection()
  const { data, isLoading, isError } = useReservedAddressOptions()
  const options = data ?? []

  const optionByAddress = useMemo(
    () => new Map(options.map((item) => [item.address.toLowerCase(), item])),
    [options],
  )
  const availableCount = options.filter((item) => item.coinStatus === 0).length

  const hint = !address
    ? '请先连接钱包以加载预留地址。'
    : isLoading
      ? '正在加载预留地址…'
      : isError
        ? '预留地址加载失败，请稍后重试。'
        : options.length === 0
          ? '暂无已锁定的预留地址，可通过上方「保留 CA」提前锁定。'
          : availableCount === 0
            ? '已锁定的预留地址均已用于创建代币，可通过上方「保留 CA」再次锁定。'
            : '选择后将使用该地址锁定时的盐值创建代币，不选则自动生成新地址。'

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-white">
        预留地址
      </label>
      <Select
        id={id}
        name={name}
        value={value?.address ?? NO_RESERVED_ADDRESS}
        onValueChange={(v) => {
          const selected =
            typeof v === 'string'
              ? (optionByAddress.get(v.toLowerCase()) ?? null)
              : null
          onChange(selected?.coinStatus === 0 ? selected : null)
        }}
        disabled={options.length === 0}
        modal={false}
      >
        <SelectTrigger
          aria-label="预留地址"
          onBlur={onBlur}
          className="box-border w-full appearance-none rounded-xs border-[#84888c] bg-transparent px-3 py-0 text-sm text-white data-[size=default]:h-10.5 data-placeholder:text-[#84888c] focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent dark:hover:bg-transparent [&_svg]:text-[#84888c]"
        >
          <SelectValue placeholder="不使用预留地址">
            {(v: string) =>
              v ? (
                <span className="font-mono">{shortReservedAddress(v)}</span>
              ) : (
                '不使用预留地址'
              )
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          className="rounded-xs border border-[#484b51] bg-[#131516] text-white ring-0"
        >
          <SelectItem
            value={NO_RESERVED_ADDRESS}
            className="py-2.5 text-sm text-[#a0a3a7] focus:bg-white/5 focus:text-white"
          >
            不使用预留地址
          </SelectItem>
          {options.map((item) => (
            <SelectItem
              key={item.address}
              value={item.address}
              disabled={item.coinStatus !== 0}
              className="py-2.5 text-sm focus:bg-white/5"
            >
              <span className="font-mono sm:hidden">
                {shortReservedAddress(item.address)}
              </span>
              <span className="hidden font-mono sm:inline">{item.address}</span>
              {item.coinStatus !== 0 && (
                <span className="ml-2 text-xs text-[#84888c]">
                  {RESERVED_STATUS_LABEL[item.coinStatus]}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-[#84888c]">{hint}</p>
    </div>
  )
}
