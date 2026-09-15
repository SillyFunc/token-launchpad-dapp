import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useConnection } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Receipt,
  RefreshCw,
  Wallet,
} from 'lucide-react'

import {
  getBuyTokenRecordPage,
  type BuyRecordStatus,
  type BuyTokenRecord,
} from '@/api/buy-record'
import { Button } from '@/components/ui/button'
import { formatAddress, formatDecimalText } from '@/lib/format'
import { getExplorerUrl } from '@/config/network'
import { cn } from '@/lib/utils'
import titleBackArrow from '@/assets/icons/back-arrow.svg'

const PAGE_SIZE = 10

const STATUS_CONFIG: Record<BuyRecordStatus, { label: string; className: string }> = {
  0: {
    label: '确认中',
    className: 'border-amber-800/40 bg-amber-950/30 text-amber-400',
  },
  1: {
    label: '成功',
    className: 'border-green-800/40 bg-green-950/30 text-green-400',
  },
  2: {
    label: '失败',
    className: 'border-red-800/40 bg-red-950/30 text-red-400',
  },
}

/** 与合约 presaleStatus 生命周期一致：0 配置期 / 1 认购中 / 2 待开盘 / 3 已开盘 / 4 已失败 */
const PRESALE_STATUS_LABEL: Record<number, string> = {
  0: '未开启',
  1: '认购中',
  2: '待开盘',
  3: '已开盘',
  4: '已失败',
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="shrink-0 text-neutral-400">{label}</span>
      <span className="min-w-0 text-right font-medium text-white">
        {children}
      </span>
    </div>
  )
}

function ExplorerLink({ value, type }: { value: string; type: 'tx' | 'address' }) {
  return (
    <a
      href={getExplorerUrl(value, type)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-neutral-300 transition-colors hover:text-[#FFA546]"
    >
      {formatAddress(value)}
      <ExternalLink className="size-3" />
    </a>
  )
}

function SubscriptionRecordCard({ record }: { record: BuyTokenRecord }) {
  // 接口约定 0/1/2，但外部数据不做信任假设，越界值兜底展示原值
  const status = STATUS_CONFIG[record.status] ?? {
    label: `未知(${String(record.status)})`,
    className: 'border-neutral-700 bg-neutral-800/80 text-neutral-400',
  }
  const presaleLabel =
    PRESALE_STATUS_LABEL[record.presaleStatus] ??
    `未知(${String(record.presaleStatus)})`

  return (
    <div className="rounded-lg border border-[#2F3737] bg-[#17191b] p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm font-bold text-white">
            {formatDecimalText(record.preAmount)}
          </span>
          <span className="shrink-0 font-semibold text-[#FFA546]">
            {record.preCoin || '--'}
          </span>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded border px-2 py-0.5 font-medium',
            status.className,
          )}
        >
          {status.label}
        </span>
      </div>

      <div className="mt-1 flex flex-col divide-y divide-[#2F3737]/60 border-t border-[#2F3737]">
        <InfoRow label="支付">
          <span className="font-mono">
            {formatDecimalText(record.payAmount)} {record.payCoin}
          </span>
        </InfoRow>
        <InfoRow label="预售状态">{presaleLabel}</InfoRow>
        <InfoRow label="认购时间">{record.createTime || '--'}</InfoRow>
        <InfoRow label="预售合约">
          <ExplorerLink value={record.contractAddress} type="address" />
        </InfoRow>
        <InfoRow label="交易哈希">
          {record.txHash ? (
            <ExplorerLink value={record.txHash} type="tx" />
          ) : (
            '--'
          )}
        </InfoRow>
      </div>
    </div>
  )
}

export const Subscription = () => {
  const { address } = useConnection()
  const navigate = useNavigate()
  const [pageNo, setPageNo] = useState(1)

  // 切换钱包后回到第一页，避免沿用上一个账户的页码
  useEffect(() => setPageNo(1), [address])

  const { data, isLoading, isError, refetch, isRefetching, isPlaceholderData } =
    useQuery({
      queryKey: ['buyTokenRecords', address, pageNo],
      queryFn: () =>
        getBuyTokenRecordPage({
          address: address!,
          pageNo,
          pageSize: PAGE_SIZE,
        }),
      enabled: Boolean(address),
      // 翻页时保留上一页数据，避免列表闪空
      placeholderData: keepPreviousData,
    })

  const records = data?.content ?? []
  const totalPages = data?.totalPages ?? 0
  const totalElements = data?.totalElements ?? 0

  return (
    <div className="relative mx-auto flex w-full flex-col pb-24 pt-6 text-white">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="返回"
            onClick={() => navigate('/')}
            className="flex size-6 shrink-0 items-center justify-center rounded-xs hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B]"
          >
            <img
              src={titleBackArrow}
              alt=""
              aria-hidden="true"
              className="size-full object-cover"
            />
          </button>
          <div>
            <h1 className="text-lg font-bold tracking-wide text-white">
              我的认购
            </h1>
            <p className="text-xs text-neutral-400">
              查看您参与的预售认购记录与支付状态
            </p>
          </div>
        </div>

        {address && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isLoading || isRefetching}
            className="cursor-pointer rounded border-[#484b51] bg-[#131516] text-xs text-neutral-300 hover:bg-white/10"
          >
            <RefreshCw
              className={`size-3.5 ${isRefetching ? 'animate-spin' : ''}`}
            />
            <span>刷新</span>
          </Button>
        )}
      </div>

      {!address && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#484b51] bg-[#131516] p-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[#FE810B]/10 text-[#FE810B]">
            <Wallet className="size-7" />
          </div>
          <h2 className="mb-1 text-base font-bold text-white">
            请先连接您的钱包
          </h2>
          <p className="mb-6 max-w-sm text-xs text-neutral-400">
            连接钱包后即可查看您的全部预售认购记录
          </p>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button
                type="button"
                onClick={show}
                className="cursor-pointer rounded-md border border-[#FE810B] bg-[#FD810B1A] px-6 py-2 text-sm font-semibold text-white transition-all active:translate-y-0.5 hover:bg-[#FD810B33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFA546]"
              >
                连接钱包
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      )}

      {address && isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse space-y-3 rounded-lg border border-[#2F3737] bg-[#131516] p-4"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-32 rounded bg-neutral-800" />
                <div className="h-5 w-14 rounded bg-neutral-800" />
              </div>
              <div className="h-3 w-full rounded bg-neutral-800/60" />
              <div className="h-3 w-2/3 rounded bg-neutral-800/40" />
            </div>
          ))}
        </div>
      )}

      {address && !isLoading && isError && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#484b51] bg-[#131516] p-12 text-center">
          <p className="mb-4 text-sm text-red-400">
            获取认购记录失败，请稍后重试
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            className="rounded border-[#484b51] bg-[#1a1c1e] text-xs text-white"
          >
            重新加载
          </Button>
        </div>
      )}

      {address && !isLoading && !isError && records.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#484b51] bg-[#131516] p-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-neutral-800 text-neutral-400">
            <Receipt className="size-7" />
          </div>
          <h2 className="mb-1 text-base font-bold text-white">
            暂无认购记录
          </h2>
          <p className="mb-6 max-w-sm text-xs text-neutral-400">
            您还没有参与过任何预售。去首页看看正在认购的代币吧！
          </p>
          <Link
            to="/board"
            className="cursor-pointer rounded-md bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] px-6 py-2 text-sm font-semibold text-white shadow-[0_3px_0_0_#963000] transition-all active:translate-y-0.5"
          >
            浏览代币
          </Link>
        </div>
      )}

      {address && !isLoading && !isError && records.length > 0 && (
        <>
          <div
            className={cn(
              'flex flex-col gap-3',
              isPlaceholderData && 'opacity-60 transition-opacity',
            )}
          >
            {records.map((record) => (
              <SubscriptionRecordCard key={record.id} record={record} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={pageNo <= 1 || isPlaceholderData}
                onClick={() => setPageNo((p) => Math.max(1, p - 1))}
                className="cursor-pointer rounded border-[#484b51] bg-[#131516] text-xs text-neutral-300 hover:bg-white/10"
              >
                <ChevronLeft className="size-3.5" />
                <span>上一页</span>
              </Button>
              <span className="text-xs text-neutral-400">
                第 {pageNo} / {totalPages} 页 · 共 {totalElements} 条
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pageNo >= totalPages || isPlaceholderData}
                onClick={() =>
                  setPageNo((p) => Math.min(totalPages, p + 1))
                }
                className="cursor-pointer rounded border-[#484b51] bg-[#131516] text-xs text-neutral-300 hover:bg-white/10"
              >
                <span>下一页</span>
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
