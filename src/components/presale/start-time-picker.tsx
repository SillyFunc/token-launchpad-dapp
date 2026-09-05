import { useEffect, useRef, useState } from 'react'
import { format, isSameDay } from 'date-fns'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Zap,
  Timer,
} from 'lucide-react'

import { cn } from '@/lib/utils'

export interface StartTimePickerProps {
  value: string // 秒级时间戳或 "0"
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
}

/** 将 Date 格式化为 HH:mm:ss 字符串 */
function formatTimeStr(d: Date): string {
  return format(d, 'HH:mm:ss')
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 生成 1 小时后、秒位归零的默认时间 */
function defaultTarget(): Date {
  const d = new Date(Date.now() + 3600 * 1000)
  d.setSeconds(0, 0)
  return d
}

/** 按日期 + HH:mm:ss 在本地时区组装时刻 */
function buildDateTime(date: Date, time: string): Date {
  const [hours, minutes, seconds] = time.split(':').map((v) => Number(v) || 0)
  const target = new Date(date)
  target.setHours(hours, minutes, seconds, 0)
  return target
}

/** 今天的 0 点 */
function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** 星期表头（周一为首列） */
const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

const selectClass =
  'h-9 min-w-0 flex-1 rounded-xs border border-[#484b51] bg-[#131516] px-1 text-center text-xs font-semibold text-white [color-scheme:dark] outline-none transition-colors focus:border-[#FE810B] disabled:cursor-not-allowed'

export function StartTimePicker({
  value,
  onChange,
  onBlur,
  disabled = false,
}: StartTimePickerProps) {
  const numericTimestamp = Number(value) || 0

  // 视觉模式与表单值解耦：进入「定时」选定具体时刻前不落值
  const [mode, setMode] = useState<'immediate' | 'timed'>(
    numericTimestamp > 0 ? 'timed' : 'immediate',
  )
  const [datePicked, setDatePicked] = useState(numericTimestamp > 0)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() =>
    numericTimestamp > 0 ? new Date(numericTimestamp * 1000) : defaultTarget(),
  )
  const [timeStr, setTimeStr] = useState(() =>
    numericTimestamp > 0
      ? formatTimeStr(new Date(numericTimestamp * 1000))
      : formatTimeStr(defaultTarget()),
  )
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const base =
      numericTimestamp > 0 ? new Date(numericTimestamp * 1000) : new Date()
    return { year: base.getFullYear(), month: base.getMonth() }
  })
  const panelRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  // 同步外部传入的 value
  useEffect(() => {
    if (numericTimestamp > 0) {
      const d = new Date(numericTimestamp * 1000)
      setMode('timed')
      setDatePicked(true)
      setSelectedDate(d)
      setTimeStr(formatTimeStr(d))
    } else {
      setMode('immediate')
      setDatePicked(false)
    }
  }, [numericTimestamp])

  // 点击面板外部 / Esc 关闭（触发按钮自身交给 onClick 切换，避免关了又开）
  useEffect(() => {
    if (!open) return
    const handlePointer = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
      onBlur?.()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onBlur])

  const now = new Date()
  const isToday = selectedDate ? isSameDay(selectedDate, now) : false
  const [hour, minute, second] = timeStr.split(':').map((v) => Number(v) || 0)

  const applyDateTime = (date: Date, time: string) => {
    onChange(String(Math.floor(buildDateTime(date, time).getTime() / 1000)))
  }

  const openPanel = () => {
    const base = selectedDate ?? now
    setView({ year: base.getFullYear(), month: base.getMonth() })
    setOpen(true)
  }

  const handleImmediate = () => {
    setMode('immediate')
    setDatePicked(false)
    setOpen(false)
    onChange('0')
    onBlur?.()
  }

  const handleTimed = () => {
    if (mode !== 'timed') {
      setMode('timed')
      setDatePicked(false)
      setSelectedDate(defaultTarget())
      setTimeStr(formatTimeStr(defaultTarget()))
    }
    onBlur?.()
  }

  // 日历网格：周一为首列，前置空位补位
  const firstWeekday = (new Date(view.year, view.month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const handlePickDay = (day: number) => {
    const date = new Date(view.year, view.month, day)
    if (date < startOfToday()) return // 过去日期不允许
    setSelectedDate(date)
    // 选中的是今天且既定时刻已过去 → 顺延到 1 分钟后
    if (isSameDay(date, now) && buildDateTime(date, timeStr).getTime() < Date.now()) {
      setTimeStr(format(new Date(Date.now() + 60_000), 'HH:mm:ss'))
    }
    setDatePicked(true)
  }

  const updateTime = (part: 'hour' | 'minute' | 'second', val: number) => {
    const parts = [hour, minute, second]
    parts[part === 'hour' ? 0 : part === 'minute' ? 1 : 2] = val
    setTimeStr(`${pad2(parts[0])}:${pad2(parts[1])}:${pad2(parts[2])}`)
  }

  /** 点击保存：应用面板中的草稿日期时间并关闭选择器 */
  const handleSave = () => {
    if (!datePicked || !selectedDate) return
    applyDateTime(selectedDate, timeStr)
    setOpen(false)
    onBlur?.()
  }

  const displayDateTime =
    mode === 'timed' && datePicked && numericTimestamp > 0
      ? format(new Date(numericTimestamp * 1000), 'yyyy年MM月dd日 HH:mm:ss')
      : null

  return (
    <div className="relative flex flex-col gap-3">
      {/* 顶部模式切换按钮 */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={handleImmediate}
          className={cn(
            'flex h-10 cursor-pointer items-center justify-center gap-2 border text-xs font-semibold transition-all select-none',
            mode === 'immediate'
              ? 'border-[#FE810B] bg-[#FE810B]/15 text-[#FFA546]'
              : 'border-[#484b51] bg-[#1a1c1e] text-neutral-400 hover:border-neutral-500 hover:text-white',
          )}
        >
          <Zap className="size-3.5" />
          <span>立即开始 (创建后开放)</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={handleTimed}
          className={cn(
            'flex h-10 cursor-pointer items-center justify-center gap-2 border text-xs font-semibold transition-all select-none',
            mode === 'timed'
              ? 'border-[#FE810B] bg-[#FE810B]/15 text-[#FFA546]'
              : 'border-[#484b51] bg-[#1a1c1e] text-neutral-400 hover:border-neutral-500 hover:text-white',
          )}
        >
          <Timer className="size-3.5" />
          <span>定时开始 (指定时间)</span>
        </button>
      </div>

      {/* 定时模式：一体化触发框 + 自绘日历/时间面板 */}
      {mode === 'timed' && (
        <>
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            onClick={() => (open ? setOpen(false) : openPanel())}
            className={cn(
              'flex h-10.5 w-full items-center gap-2 rounded-xs border border-[#484b51] bg-[#1a1c1e] px-3.5 text-left text-sm text-white transition-colors hover:border-[#6b6f75] focus:border-[#FE810B] focus:outline-none',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <CalendarIcon className="size-4 shrink-0 text-[#FFA546]" />
            <span className="truncate font-mono font-medium">
              {displayDateTime || '选择开始时间'}
            </span>
          </button>

          {open && (
            <div
              ref={panelRef}
              className="absolute inset-x-0 top-full z-50 mt-2 flex flex-col gap-2 rounded-xs border border-[#484b51] bg-[#141618] p-3 text-white shadow-2xl"
            >
              {/* 月份导航 */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  aria-label="上个月"
                  onClick={() =>
                    setView((v) =>
                      v.month === 0
                        ? { year: v.year - 1, month: 11 }
                        : { ...v, month: v.month - 1 },
                    )
                  }
                  className="flex size-8 cursor-pointer items-center justify-center rounded-xs text-neutral-400 hover:bg-white/10 hover:text-white"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-sm font-semibold">
                  {view.year}年{view.month + 1}月
                </span>
                <button
                  type="button"
                  aria-label="下个月"
                  onClick={() =>
                    setView((v) =>
                      v.month === 11
                        ? { year: v.year + 1, month: 0 }
                        : { ...v, month: v.month + 1 },
                    )
                  }
                  className="flex size-8 cursor-pointer items-center justify-center rounded-xs text-neutral-400 hover:bg-white/10 hover:text-white"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>

              {/* 星期表头 */}
              <div className="grid grid-cols-7 text-center text-xs text-neutral-500">
                {WEEK_LABELS.map((w) => (
                  <span key={w} className="py-1">
                    {w}
                  </span>
                ))}
              </div>

              {/* 日期网格：过去的日期禁用 */}
              <div className="grid grid-cols-7 gap-y-1">
                {cells.map((day, index) => {
                  if (day === null) return <span key={`blank-${index}`} />
                  const cellDate = new Date(view.year, view.month, day)
                  const isPast = cellDate < startOfToday()
                  const isSelected = selectedDate
                    ? isSameDay(cellDate, selectedDate)
                    : false
                  const isTodayCell = isSameDay(cellDate, now)
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={isPast}
                      onClick={() => handlePickDay(day)}
                      className={cn(
                        'mx-auto flex size-9 items-center justify-center rounded-full text-xs transition-colors',
                        isPast && 'cursor-not-allowed text-neutral-600',
                        !isPast &&
                          !isSelected &&
                          'cursor-pointer text-neutral-200 hover:bg-white/10',
                        isSelected &&
                          'cursor-pointer bg-[#FE810B] font-bold text-white',
                        !isSelected &&
                          isTodayCell &&
                          'border border-[#FE810B]/60 text-[#FFA546]',
                      )}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>

              {/* 时/分/秒：选完日期后出现；选今天时过去的时间项禁用 */}
              {datePicked && (
                <div className="flex items-center gap-2 border-t border-[#2F3737] pt-2.5">
                  <select
                    aria-label="时"
                    value={pad2(hour)}
                    disabled={disabled}
                    onChange={(e) =>
                      updateTime('hour', Number(e.target.value))
                    }
                    className={selectClass}
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option
                        key={h}
                        value={pad2(h)}
                        disabled={isToday && h < now.getHours()}
                      >
                        {pad2(h)}时
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="分"
                    value={pad2(minute)}
                    disabled={disabled}
                    onChange={(e) =>
                      updateTime('minute', Number(e.target.value))
                    }
                    className={selectClass}
                  >
                    {Array.from({ length: 60 }, (_, m) => (
                      <option
                        key={m}
                        value={pad2(m)}
                        disabled={
                          isToday &&
                          hour === now.getHours() &&
                          m < now.getMinutes()
                        }
                      >
                        {pad2(m)}分
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="秒"
                    value={pad2(second)}
                    disabled={disabled}
                    onChange={(e) =>
                      updateTime('second', Number(e.target.value))
                    }
                    className={selectClass}
                  >
                    {Array.from({ length: 60 }, (_, s) => (
                      <option
                        key={s}
                        value={pad2(s)}
                        disabled={
                          isToday &&
                          hour === now.getHours() &&
                          minute === now.getMinutes() &&
                          s < now.getSeconds()
                        }
                      >
                        {pad2(s)}秒
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 保存：应用面板中的选择并关闭 */}
              <button
                type="button"
                disabled={disabled || !datePicked}
                onClick={handleSave}
                className="flex h-10 w-full cursor-pointer items-center justify-center bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-sm font-bold text-white [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] transition-transform select-none active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                保存
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
