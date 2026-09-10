import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { format } from 'date-fns'
import { useMemoizedFn, useKeyPress } from 'ahooks'
import { Calendar as CalendarIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface StartTimePickerProps {
  value: string // 秒级时间戳或 "0"
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
}

/** 滚轮几何：单项高度 × 可见行数 = 视口高度，上下留白让首尾项也能滚到中心 */
const ITEM_HEIGHT = 44
const VISIBLE_ROWS = 5
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS
const EDGE_PADDING = (ITEM_HEIGHT * (VISIBLE_ROWS - 1)) / 2
/** 必须与弹层底色一致，用于上下渐隐遮罩 */
const SHEET_BG = '#141517'
/** 滚动停稳判定（ms）：太短会打断惯性，太长会让选中反馈迟钝 */
const SETTLE_DELAY = 110
/** 年份可选跨度：预售开始时间不会排到数年之后 */
const YEAR_SPAN = 2

const pad2 = (n: number) => String(n).padStart(2, '0')

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

/** 未选定时的默认开始时间：1 小时后，秒位归零 */
function defaultTarget(): Date {
  const d = new Date(Date.now() + 3600 * 1000)
  d.setSeconds(0, 0)
  return d
}

interface WheelItem {
  value: number
  label: string
  disabled?: boolean
}

interface WheelColumnProps {
  items: WheelItem[]
  value: number
  onChange: (value: number) => void
  ariaLabel: string
}

/**
 * 单列滚轮。
 * 复用原生 overflow-y 滚动 + scroll-snap，白拿移动端惯性与边界回弹手感；
 * 停稳后按 scrollTop 反推选中项，落到禁用项时自动吸附到最近的可选项。
 */
function WheelColumn({ items, value, onChange, ariaLabel }: WheelColumnProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const settleTimer = useRef<number | undefined>(undefined)

  const currentIndex = useMemo(() => {
    const found = items.findIndex((item) => item.value === value)
    return found === -1 ? 0 : found
  }, [items, value])

  // 父级改值（切月导致日数变化、过去时间被顺延）时把滚轮拉回对应位置
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const target = currentIndex * ITEM_HEIGHT
    if (Math.abs(el.scrollTop - target) > 1) {
      el.scrollTo({ top: target })
    }
  }, [currentIndex])

  useEffect(
    () => () => {
      if (settleTimer.current) window.clearTimeout(settleTimer.current)
    },
    [],
  )

  const handleScroll = useMemoizedFn(() => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      const el = scrollRef.current
      if (!el || items.length === 0) return

      const raw = Math.round(el.scrollTop / ITEM_HEIGHT)
      const landed = Math.min(Math.max(raw, 0), items.length - 1)

      let target = landed
      if (items[target]?.disabled) {
        // 向外找最近的可选项；优先向后（更晚），因为更早的那些通常已是过去
        let found = -1
        for (let step = 1; step <= items.length; step += 1) {
          const later = landed + step
          const earlier = landed - step
          if (later < items.length && !items[later].disabled) {
            found = later
            break
          }
          if (earlier >= 0 && !items[earlier].disabled) {
            found = earlier
            break
          }
        }
        if (found === -1) {
          // 整列都不可选：退回当前值，交给外层的顺延逻辑兜底
          const back = currentIndex * ITEM_HEIGHT
          if (Math.abs(el.scrollTop - back) > 1) {
            el.scrollTo({ top: back, behavior: 'smooth' })
          }
          return
        }
        target = found
      }

      const targetTop = target * ITEM_HEIGHT
      if (Math.abs(el.scrollTop - targetTop) > 1) {
        el.scrollTo({ top: targetTop, behavior: 'smooth' })
      }
      const next = items[target]
      if (next && next.value !== value) onChange(next.value)
    }, SETTLE_DELAY)
  })

  return (
    <div
      className="relative min-w-0 flex-1"
      style={{ height: WHEEL_HEIGHT }}
      role="listbox"
      aria-label={ariaLabel}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scroll-snap-type:y_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ height: EDGE_PADDING }} aria-hidden />
        {items.map((item) => (
          <div
            key={item.value}
            role="option"
            aria-selected={item.value === value}
            style={{ height: ITEM_HEIGHT, scrollSnapAlign: 'center' }}
            className={cn(
              'flex items-center justify-center text-sm tabular-nums transition-colors duration-150 select-none',
              item.disabled
                ? 'text-neutral-700'
                : item.value === value
                  ? 'font-semibold text-white'
                  : 'text-neutral-500',
            )}
          >
            {item.label}
          </div>
        ))}
        <div style={{ height: EDGE_PADDING }} aria-hidden />
      </div>

      {/* 上下渐隐遮罩，营造滚轮纵深；pointer-events-none 不拦截滚动 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${SHEET_BG} 0%, transparent 34%, transparent 66%, ${SHEET_BG} 100%)`,
        }}
      />
    </div>
  )
}

export function StartTimePicker({
  value,
  onChange,
  onBlur,
  disabled = false,
}: StartTimePickerProps) {
  const numericTimestamp = Number(value) || 0
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)

  const initial =
    numericTimestamp > 0 ? new Date(numericTimestamp * 1000) : defaultTarget()
  const [year, setYear] = useState(initial.getFullYear())
  const [month, setMonth] = useState(initial.getMonth() + 1)
  const [day, setDay] = useState(initial.getDate())
  const [hour, setHour] = useState(initial.getHours())
  const [minute, setMinute] = useState(initial.getMinutes())
  // 「现在」的基准在打开时冻结，避免滚动途中跨分钟导致禁用项反复变化
  const [referenceNow, setReferenceNow] = useState(() => new Date())

  useEffect(() => {
    setMounted(true)
  }, [])

  // 弹层打开时锁背景滚动
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // 弹层可能长时间开着；让「现在」的基准跟上真实时钟，
  // 否则用户会选中并确认一个其实已经过去的时刻
  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setReferenceNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [open])

  const closeSheet = useMemoizedFn(() => {
    setOpen(false)
    onBlur?.()
  })

  useKeyPress('esc', closeSheet, { events: ['keydown'] })

  const curYear = referenceNow.getFullYear()
  const curMonth = referenceNow.getMonth() + 1
  const curDay = referenceNow.getDate()
  const curHour = referenceNow.getHours()
  const curMinute = referenceNow.getMinutes()

  const isTodayPicked = year === curYear && month === curMonth && day === curDay
  const monthDays = daysInMonth(year, month)

  // 切月/切年后把「日」夹紧到当月有效范围
  useEffect(() => {
    if (day > monthDays) setDay(monthDays)
  }, [day, monthDays])

  // 组合出的时刻若已过去（含整列不可选的边界，如 23:59），统一顺延到下一分钟
  useEffect(() => {
    if (!open) return
    const composed = new Date(year, month - 1, day, hour, minute, 0, 0)
    if (composed.getTime() > referenceNow.getTime()) return
    const bumped = new Date(referenceNow.getTime() + 60_000)
    bumped.setSeconds(0, 0)
    setYear(bumped.getFullYear())
    setMonth(bumped.getMonth() + 1)
    setDay(bumped.getDate())
    setHour(bumped.getHours())
    setMinute(bumped.getMinutes())
  }, [open, year, month, day, hour, minute, referenceNow])

  const yearItems = useMemo<WheelItem[]>(
    () =>
      Array.from({ length: YEAR_SPAN + 1 }, (_, i) => {
        const y = curYear + i
        return { value: y, label: `${y}年` }
      }),
    [curYear],
  )

  const monthItems = useMemo<WheelItem[]>(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1
        return {
          value: m,
          label: `${pad2(m)}月`,
          disabled: year === curYear && m < curMonth,
        }
      }),
    [year, curYear, curMonth],
  )

  const dayItems = useMemo<WheelItem[]>(
    () =>
      Array.from({ length: monthDays }, (_, i) => {
        const d = i + 1
        return {
          value: d,
          label: `${pad2(d)}日`,
          disabled: year === curYear && month === curMonth && d < curDay,
        }
      }),
    [monthDays, year, curYear, month, curMonth, curDay],
  )

  const hourItems = useMemo<WheelItem[]>(
    () =>
      Array.from({ length: 24 }, (_, h) => ({
        value: h,
        label: `${pad2(h)}时`,
        disabled: isTodayPicked && h < curHour,
      })),
    [isTodayPicked, curHour],
  )

  const minuteItems = useMemo<WheelItem[]>(
    () =>
      Array.from({ length: 60 }, (_, m) => ({
        value: m,
        label: `${pad2(m)}分`,
        // 同一小时内必须严格晚于当前分钟，否则组合出的时刻仍可能已过去
        disabled: isTodayPicked && hour === curHour && m <= curMinute,
      })),
    [isTodayPicked, hour, curHour, curMinute],
  )

  const composedDate = new Date(year, month - 1, day, hour, minute, 0, 0)
  const previewText = format(composedDate, 'yyyy年MM月dd日 HH:mm')
  const isInvalid = composedDate.getTime() <= referenceNow.getTime()

  const openPanel = useMemoizedFn(() => {
    if (disabled) return
    const start =
      numericTimestamp > 0 ? new Date(numericTimestamp * 1000) : defaultTarget()
    setReferenceNow(new Date())
    setYear(start.getFullYear())
    setMonth(start.getMonth() + 1)
    setDay(start.getDate())
    setHour(start.getHours())
    setMinute(start.getMinutes())
    setOpen(true)
  })

  const handleConfirm = useMemoizedFn(() => {
    // referenceNow 仍可能落后于真实时钟（tick 间隔内），确认前用真实时间做最终校验
    if (composedDate.getTime() <= Date.now()) {
      setReferenceNow(new Date())
      return
    }
    onChange(String(Math.floor(composedDate.getTime() / 1000)))
    closeSheet()
  })

  const displayText =
    numericTimestamp > 0
      ? format(new Date(numericTimestamp * 1000), 'yyyy年MM月dd日 HH:mm')
      : '选择开始时间'

  const sheet = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeSheet}
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            // 入场用弹簧更有质感；退场必须干脆，否则关闭后会阻塞交互一秒多
            exit={{ y: '100%', transition: { duration: 0.22, ease: 'easeIn' } }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-label="选择开始时间"
            className="relative z-10 w-full rounded-t-2xl border-t border-[#484b51] bg-[#141517] pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
          >
            {/* 标题栏：取消 / 标题 / 确定 */}
            <div className="flex items-center justify-between border-b border-[#2F3737] px-2 py-1">
              <button
                type="button"
                onClick={closeSheet}
                className="cursor-pointer px-2 py-2 text-sm text-neutral-400 transition-colors hover:text-white"
              >
                取消
              </button>
              <h3 className="text-sm font-semibold tracking-wide text-white">
                选择开始时间
              </h3>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isInvalid}
                className="cursor-pointer px-2 py-2 text-sm font-semibold text-[#FFA546] transition-colors hover:text-white disabled:cursor-not-allowed disabled:text-neutral-600"
              >
                确定
              </button>
            </div>

            {/* 选中结果回显 */}
            {/* <div className="flex items-center justify-center gap-2 px-4 py-2.5">
              <span className="font-mono text-base font-bold tabular-nums text-white">
                {previewText}
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-2.5 font-medium',
                  isTodayPicked
                    ? 'bg-[#FE810B]/15 text-[#FFA546]'
                    : 'bg-white/5 text-neutral-400',
                )}
              >
                {isTodayPicked ? '今天' : '指定日期'}
              </span>
            </div> */}

            {/* 滚轮区 */}
            <div className="relative px-3">
              {/* 中央选中条 */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-lg border border-[#FE810B]/35 bg-[#FE810B]/8"
                style={{ height: ITEM_HEIGHT }}
              />
              <div className="flex items-stretch">
                <WheelColumn
                  ariaLabel="年"
                  items={yearItems}
                  value={year}
                  onChange={setYear}
                />
                <WheelColumn
                  ariaLabel="月"
                  items={monthItems}
                  value={month}
                  onChange={setMonth}
                />
                <WheelColumn
                  ariaLabel="日"
                  items={dayItems}
                  value={day}
                  onChange={setDay}
                />
                <WheelColumn
                  ariaLabel="时"
                  items={hourItems}
                  value={hour}
                  onChange={setHour}
                />
                <WheelColumn
                  ariaLabel="分"
                  items={minuteItems}
                  value={minute}
                  onChange={setMinute}
                />
              </div>
            </div>

            {isInvalid ? (
              <p className="px-4 pt-2 text-center text-2.75 text-[#f7594b]">
                开始时间必须晚于当前时间
              </p>
            ) : (
              <p className="px-4 pt-2 text-center text-2.75 text-neutral-500">
                上下滑动选择，过去的时刻不可选
              </p>
            )}

            <div className="px-3 pt-2.5">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isInvalid}
                className="flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-sm font-bold text-white [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] transition-transform select-none active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                确认开始时间
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )

  return (
    <div className="relative flex flex-col">
      <button
        type="button"
        disabled={disabled}
        onClick={openPanel}
        className={cn(
          'flex h-10.5 w-full items-center gap-2 rounded-xs border border-[#484b51] bg-[#1a1c1e] px-3.5 text-left text-sm text-white transition-colors hover:border-[#6b6f75] focus:border-[#FE810B] focus:outline-none',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <CalendarIcon className="size-4 shrink-0 text-[#FFA546]" />
        <span className="truncate font-mono font-medium tabular-nums">
          {displayText}
        </span>
      </button>

      {mounted && createPortal(sheet, document.body)}
    </div>
  )
}
