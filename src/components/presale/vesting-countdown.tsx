import { useState, useEffect, useMemo } from 'react'
import { formatEther } from 'viem'
import {
  Gift,
  Clock,
  CheckCircle2,
  Sparkles,
  Timer,
  Layers,
} from 'lucide-react'

import { Web3ActionButton } from '@/components/common/web3-action-button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export interface VestingCountdownProps {
  tokenSymbol?: string
  presaleStatus?: number // 3 = 已开盘
  userShare: bigint
  userClaimed: bigint
  userClaimable: bigint
  nextVestingTime: bigint
  vestingStart: bigint
  vestingDelay: bigint
  vestingRate: bigint
  isClaiming: boolean
  onClaim: () => void | Promise<void>
  onCycleReached?: () => void
  className?: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export function VestingCountdown({
  tokenSymbol = '',
  presaleStatus = 0,
  userShare,
  userClaimed,
  userClaimable,
  nextVestingTime,
  vestingStart,
  vestingDelay,
  vestingRate,
  isClaiming,
  onClaim,
  onCycleReached,
  className,
}: VestingCountdownProps) {
  // 当前时间戳（秒），每秒刷新以驱动精准倒计时
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const timer = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const rate = Number(vestingRate) || 10
  const delay = Number(vestingDelay) || 60
  const totalPeriods = Math.ceil(100 / rate)
  const start = Number(vestingStart)

  // 计算已过周期数与总体释放状态
  const periodsPassed = useMemo(() => {
    if (start <= 0 || nowSec < start || delay <= 0) return 0
    return Math.floor((nowSec - start) / delay)
  }, [start, nowSec, delay])

  // 100% 全部周期释放完毕
  const isAllVested = useMemo(() => {
    if (presaleStatus !== 3) return false
    return periodsPassed * rate >= 100
  }, [presaleStatus, periodsPassed, rate])

  // 下一个周期边界时间戳 (秒)
  const targetUnlockTime = useMemo(() => {
    if (nextVestingTime > 0n) {
      return Number(nextVestingTime)
    }
    if (start > 0 && delay > 0) {
      return start + (periodsPassed + 1) * delay
    }
    return 0
  }, [nextVestingTime, start, periodsPassed, delay])

  // 剩余秒数
  const remainingSeconds = Math.max(0, targetUnlockTime - nowSec)

  // 倒计时到达 0 时触发一次刷新回调
  useEffect(() => {
    if (
      presaleStatus === 3 &&
      !isAllVested &&
      remainingSeconds === 0 &&
      targetUnlockTime > 0
    ) {
      onCycleReached?.()
    }
  }, [remainingSeconds, presaleStatus, isAllVested, targetUnlockTime, onCycleReached])

  // 拆分天、时、分、秒
  const days = Math.floor(remainingSeconds / 86400)
  const hours = Math.floor((remainingSeconds % 86400) / 3600)
  const minutes = Math.floor((remainingSeconds % 3600) / 60)
  const seconds = remainingSeconds % 60

  // 总体线性释放比例 (0 - 100%)
  const overallVestedPercent = isAllVested
    ? 100
    : Math.min(100, Math.max(0, periodsPassed * rate))

  // 用户个人锁定待释放数量
  const userTotalNum = Number(formatEther(userShare))
  const userClaimedNum = Number(formatEther(userClaimed))
  const userClaimableNum = Number(formatEther(userClaimable))
  const userLockedNum = Math.max(
    0,
    userTotalNum - userClaimedNum - userClaimableNum,
  )

  // 格式化周期时长文本
  const delayText = useMemo(() => {
    if (delay <= 0) return '立即'
    if (delay % 86400 === 0) return `${delay / 86400} 天`
    if (delay % 3600 === 0) return `${delay / 3600} 小时`
    if (delay % 60 === 0) return `${delay / 60} 分钟`
    return `${delay} 秒`
  }, [delay])

  // 未开盘状态兜底
  if (presaleStatus !== 3) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border border-[#2F3737] bg-[#141517] p-8 text-center text-white',
          className,
        )}
      >
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-white/5 text-neutral-400">
          <Clock className="size-6" />
        </div>
        <h3 className="text-sm font-bold text-white mb-1">代币尚未开盘上线</h3>
        <p className="text-xs text-neutral-400 max-w-sm">
          开盘加池成功后，合约将正式启动线性解锁倒计时，届时认购者与创建者可在本面板按期领取代币。
        </p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-4 text-white', className)}>
      {/* 核心卡片：倒计时与释放状态 */}
      <div className="flex flex-col rounded-xl border border-[#2F3737] bg-[#141517] p-5 shadow-2xl">
        {/* 顶部标题行 */}
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <Timer className="size-4 text-[#FE810B]" />
            <span className="text-sm font-bold tracking-wide text-white">
              代币解锁倒计时
            </span>
            <span className="rounded bg-[#FE810B]/20 px-2 py-0.5 text-[10px] font-semibold text-[#FFA546]">
              开盘已生效
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-mono">
            <Layers className="size-3.5 text-neutral-500" />
            <span>
              周期进度: 第 {Math.min(totalPeriods, periodsPassed)} / {totalPeriods} 期
            </span>
          </div>
        </div>

        {/* 倒计时数字看板 */}
        {!isAllVested ? (
          <div className="flex flex-col items-center justify-center py-5">
            <span className="text-xs text-neutral-400 mb-2">
              距离第 {Math.min(totalPeriods, periodsPassed + 1)} 期解锁还剩（释放 {rate}% 份额）
            </span>

            <div className="flex items-center justify-center gap-2 sm:gap-3 font-mono">
              {/* 天 */}
              <div className="flex flex-col items-center rounded-lg border border-[#2F3737] bg-[#0d0e10] px-3 py-2 min-w-[54px] sm:min-w-[64px]">
                <span className="text-2xl sm:text-3xl font-black text-white">
                  {pad2(days)}
                </span>
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider mt-0.5">
                  天 (Days)
                </span>
              </div>

              <span className="text-xl font-bold text-neutral-600">:</span>

              {/* 时 */}
              <div className="flex flex-col items-center rounded-lg border border-[#2F3737] bg-[#0d0e10] px-3 py-2 min-w-[54px] sm:min-w-[64px]">
                <span className="text-2xl sm:text-3xl font-black text-white">
                  {pad2(hours)}
                </span>
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider mt-0.5">
                  时 (Hours)
                </span>
              </div>

              <span className="text-xl font-bold text-neutral-600">:</span>

              {/* 分 */}
              <div className="flex flex-col items-center rounded-lg border border-[#2F3737] bg-[#0d0e10] px-3 py-2 min-w-[54px] sm:min-w-[64px]">
                <span className="text-2xl sm:text-3xl font-black text-white">
                  {pad2(minutes)}
                </span>
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider mt-0.5">
                  分 (Mins)
                </span>
              </div>

              <span className="text-xl font-bold text-neutral-600">:</span>

              {/* 秒 */}
              <div className="flex flex-col items-center rounded-lg border border-[#FE810B]/50 bg-[#0d0e10] px-3 py-2 min-w-[54px] sm:min-w-[64px] shadow-[0_0_15px_rgba(254,129,11,0.15)]">
                <span className="text-2xl sm:text-3xl font-black text-[#FE810B]">
                  {pad2(seconds)}
                </span>
                <span className="text-[10px] text-[#FFA546] uppercase tracking-wider mt-0.5">
                  秒 (Secs)
                </span>
              </div>
            </div>

            <div className="mt-3 text-[11px] text-neutral-500">
              释放规则：每过 {delayText} 自动释放总份额的 {rate}%，直至 100% 释放完毕
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="size-7" />
            </div>
            <div className="text-base font-bold text-white">全部周期已释放完毕</div>
            <p className="text-xs text-neutral-400 mt-1">
              所有 {totalPeriods} 个周期的代币份额均已 100% 完全解锁
            </p>
          </div>
        )}

        {/* 总体解锁进度条 */}
        <div className="flex flex-col gap-1.5 border-t border-white/5 pt-3">
          <div className="flex justify-between text-xs">
            <span className="text-neutral-400">总体解锁进度</span>
            <span className="font-mono font-bold text-[#FFA546]">
              {overallVestedPercent}%
            </span>
          </div>
          <Progress
            value={overallVestedPercent}
            className="h-2 bg-neutral-800"
          />
        </div>
      </div>

      {/* 我的个人持仓与领取看板 */}
      <div className="flex flex-col rounded-xl border border-[#2F3737] bg-[#141517] p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
          <div className="flex items-center gap-2">
            <Gift className="size-4 text-[#FFA546]" />
            <span className="text-sm font-bold text-white">我的代币份额</span>
          </div>

          {userClaimable > 0n && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
              <Sparkles className="size-3" />
              当前有可领取份额
            </span>
          )}
        </div>

        {/* 4 宫格数据展示 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="flex flex-col gap-1 rounded-lg border border-[#2F3737] bg-[#181a1d] p-3">
            <span className="text-neutral-400">总认购份额</span>
            <span className="font-mono text-sm sm:text-base font-bold text-white truncate">
              {userTotalNum.toLocaleString()}
            </span>
            <span className="text-[10px] text-neutral-500 font-mono truncate">
              {tokenSymbol}
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border border-[#2F3737] bg-[#181a1d] p-3">
            <span className="text-neutral-400">已领取代币</span>
            <span className="font-mono text-sm sm:text-base font-bold text-neutral-300 truncate">
              {userClaimedNum.toLocaleString()}
            </span>
            <span className="text-[10px] text-neutral-500 font-mono truncate">
              {tokenSymbol}
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border border-[#FE810B]/40 bg-[#FE810B]/5 p-3">
            <span className="text-[#FFA546] font-semibold">当前可领取</span>
            <span className="font-mono text-sm sm:text-base font-bold text-[#FFA546] truncate">
              {userClaimableNum.toLocaleString()}
            </span>
            <span className="text-[10px] text-[#FFA546]/70 font-mono truncate">
              {tokenSymbol}
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border border-[#2F3737] bg-[#181a1d] p-3">
            <span className="text-neutral-400">锁定待解锁</span>
            <span className="font-mono text-sm sm:text-base font-bold text-neutral-400 truncate">
              {userLockedNum.toLocaleString()}
            </span>
            <span className="text-[10px] text-neutral-500 font-mono truncate">
              {tokenSymbol}
            </span>
          </div>
        </div>

        {/* 领取代币主操作按钮 */}
        <div className="pt-2">
          <Web3ActionButton
            type="button"
            size="default"
            onAction={onClaim}
            loading={isClaiming}
            loadingText="正在领取代币到钱包…"
            disabled={userClaimable <= 0n || isClaiming}
            className="h-11 w-full border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-sm font-bold text-white shadow-[0_3px_0_0_#963000] transition-transform active:translate-y-0.5 disabled:opacity-50 cursor-pointer"
          >
            <Gift className="size-4" />
            <span>
              {userClaimable > 0n
                ? `立即领取 ${userClaimableNum.toLocaleString()} ${tokenSymbol}`
                : userShare > 0n && userClaimed >= userShare
                  ? '全部代币已领取完毕'
                  : userShare > 0n
                    ? '暂无可领取份额（等待下期解锁倒计时）'
                    : '无代币份额可领取'}
            </span>
          </Web3ActionButton>
        </div>
      </div>
    </div>
  )
}
