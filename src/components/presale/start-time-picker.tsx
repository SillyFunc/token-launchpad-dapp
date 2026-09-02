import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Calendar as CalendarIcon, Clock, Zap, Timer, Check } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface StartTimePickerProps {
  value: string // 秒级时间戳或 "0"
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
}

export function StartTimePicker({
  value,
  onChange,
  onBlur,
  disabled = false,
}: StartTimePickerProps) {
  const isImmediate = !value || value === '0'
  const numericTimestamp = Number(value) || 0

  // 内部日期状态
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    if (numericTimestamp > 0) {
      return new Date(numericTimestamp * 1000)
    }
    // 默认提供 1 小时后的时间
    return new Date(Date.now() + 3600 * 1000)
  })

  // 内部时间字符串状态 (HH:mm)
  const [timeStr, setTimeStr] = useState<string>(() => {
    if (numericTimestamp > 0) {
      const d = new Date(numericTimestamp * 1000)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    const d = new Date(Date.now() + 3600 * 1000)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })

  const [isOpen, setIsOpen] = useState(false)

  // 同步外部传入的 value
  useEffect(() => {
    if (numericTimestamp > 0) {
      const d = new Date(numericTimestamp * 1000)
      setSelectedDate(d)
      setTimeStr(
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      )
    }
  }, [numericTimestamp])

  const applyDateTime = (date: Date | undefined, time: string) => {
    if (!date) return
    const [hours, minutes] = time.split(':').map((v) => Number(v) || 0)
    const target = new Date(date)
    target.setHours(hours, minutes, 0, 0)
    const unixSec = Math.floor(target.getTime() / 1000)
    onChange(String(unixSec))
  }

  const handleSelectDate = (date: Date | undefined) => {
    if (!date) return
    setSelectedDate(date)
    applyDateTime(date, timeStr)
  }

  const handleTimeChange = (newTime: string) => {
    setTimeStr(newTime)
    if (selectedDate) {
      applyDateTime(selectedDate, newTime)
    }
  }

  const handleQuickSet = (offsetHours: number) => {
    const target = new Date(Date.now() + offsetHours * 3600 * 1000)
    setSelectedDate(target)
    const t = `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`
    setTimeStr(t)
    applyDateTime(target, t)
    setIsOpen(false)
  }

  const displayDateTime =
    !isImmediate && numericTimestamp > 0
      ? format(new Date(numericTimestamp * 1000), 'yyyy年MM月dd日 HH:mm', {
          locale: zhCN,
        })
      : null

  return (
    <div className="flex flex-col gap-3">
      {/* 顶部模式切换按钮 */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange('0')
            onBlur?.()
          }}
          className={cn(
            'flex h-10 cursor-pointer items-center justify-center gap-2 border text-xs font-semibold transition-all select-none',
            isImmediate
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
          onClick={() => {
            if (isImmediate) {
              // 切换到定时模式时赋初值（1小时后）
              const defaultTarget = new Date(Date.now() + 3600 * 1000)
              setSelectedDate(defaultTarget)
              const t = `${String(defaultTarget.getHours()).padStart(2, '0')}:${String(defaultTarget.getMinutes()).padStart(2, '0')}`
              setTimeStr(t)
              applyDateTime(defaultTarget, t)
            }
            setIsOpen(true)
            onBlur?.()
          }}
          className={cn(
            'flex h-10 cursor-pointer items-center justify-center gap-2 border text-xs font-semibold transition-all select-none',
            !isImmediate
              ? 'border-[#FE810B] bg-[#FE810B]/15 text-[#FFA546]'
              : 'border-[#484b51] bg-[#1a1c1e] text-neutral-400 hover:border-neutral-500 hover:text-white',
          )}
        >
          <Timer className="size-3.5" />
          <span>定时开始 (指定时间)</span>
        </button>
      </div>

      {/* 定时开始模式下的选择器触发器 */}
      {!isImmediate && (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                disabled={disabled}
                className={cn(
                  'flex h-10.5 w-full items-center justify-between border border-[#484b51] bg-[#1a1c1e] px-3.5 text-xs text-white transition-colors hover:border-[#FE810B] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B]',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              />
            }
          >
            <div className="flex items-center gap-2">
              <CalendarIcon className="size-4 text-[#FFA546]" />
              <span className="font-mono text-sm font-medium">
                {displayDateTime || '请点击选择开始时间'}
              </span>
            </div>
            <span className="text-[11px] text-[#FFA546] hover:underline">
              更改时间
            </span>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            className="w-auto border border-[#484b51] bg-[#141618] p-4 text-white shadow-2xl"
          >
            <div className="flex flex-col gap-3">
              {/* 日历组件 */}
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleSelectDate}
                disabled={(date) =>
                  date < new Date(Date.now() - 24 * 3600 * 1000)
                }
                locale={zhCN}
                className="border border-[#2F3737] bg-[#181a1d] p-3 text-white"
              />

              {/* 时间微调与快捷设定 */}
              <div className="flex flex-col gap-2 border border-[#2F3737] bg-[#181a1d] p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-neutral-300">
                    <Clock className="size-3.5 text-[#FFA546]" />
                    具体时间 (24小时制)
                  </span>
                  <input
                    type="time"
                    value={timeStr}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    className="h-7 border border-[#484b51] bg-[#131516] px-2 text-xs font-semibold text-white focus:border-[#FE810B] focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1.5 pt-1 text-[11px]">
                  <span className="text-neutral-500">快捷预设:</span>
                  <button
                    type="button"
                    onClick={() => handleQuickSet(1)}
                    className="cursor-pointer bg-white/5 px-2 py-0.5 text-neutral-300 hover:bg-white/10 hover:text-[#FFA546]"
                  >
                    1小时后
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSet(3)}
                    className="cursor-pointer bg-white/5 px-2 py-0.5 text-neutral-300 hover:bg-white/10 hover:text-[#FFA546]"
                  >
                    3小时后
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSet(24)}
                    className="cursor-pointer bg-white/5 px-2 py-0.5 text-neutral-300 hover:bg-white/10 hover:text-[#FFA546]"
                  >
                    明天此时
                  </button>
                </div>
              </div>

              {/* 底部确认按钮 */}
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (selectedDate) {
                    applyDateTime(selectedDate, timeStr)
                  }
                  setIsOpen(false)
                }}
                className="w-full bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white"
              >
                <Check className="size-3.5" />
                确认选用此时段
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
