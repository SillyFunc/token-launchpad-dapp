import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Delete, X, Check } from 'lucide-react'
import {
  useControllableValue,
  useMemoizedFn,
  useBoolean,
  useKeyPress,
} from 'ahooks'
import { cn } from '@/lib/utils'

export interface NumericKeypadProps {
  /** 是否打开键盘 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 当前数值（受控） */
  value?: string | number
  /** 默认初始值（非受控） */
  defaultValue?: string | number
  /** 数值改变回调 */
  onChange?: (val: string) => void
  /** 点击确定回调 */
  onConfirm?: (val: string) => void
  /** 键盘标题 */
  title?: string
  /** 辅助说明文字 */
  description?: string
  /** 单位后缀（如 "天", "%", "BNB"） */
  unit?: string
  /** 是否允许输入小数点，默认 false */
  allowDecimal?: boolean
  /** 快捷选项预设 */
  presets?: Array<{ label: string; value: string | number }>
  /** 最小值 */
  min?: number
  /** 最大值 */
  max?: number
  /** 小数位限制 */
  maxDecimals?: number
}

export function NumericKeypad(props: NumericKeypadProps) {
  const {
    open,
    onClose,
    onConfirm,
    title = '请输入数值',
    description,
    unit,
    allowDecimal = false,
    presets,
    min,
    max,
    maxDecimals = 2,
  } = props

  const sheetRef = useRef<HTMLDivElement>(null)

  // 1. ahooks useControllableValue: 统一受控与非受控双模式
  const [val, setVal] = useControllableValue<string>(props, {
    defaultValue: '',
  })
  const displayVal = String(val ?? '')

  // 2. 同步锁死弹层背景滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // 3. ahooks useMemoizedFn: 持久化稳定回调，避免重新渲染与闭包过期
  const handleKey = useMemoizedFn((key: string) => {
    let next = displayVal

    if (key === 'backspace') {
      next = next.slice(0, -1)
    } else if (key === 'clear') {
      next = ''
    } else if (key === '.') {
      if (!allowDecimal || next.includes('.')) return
      next = next === '' ? '0.' : next + '.'
    } else {
      // 0-9 数字键
      if (next === '0' && key !== '.') {
        next = key
      } else {
        if (next.includes('.')) {
          const [, decimals] = next.split('.')
          if (decimals && decimals.length >= maxDecimals) return
        }
        next = next + key
      }

      if (max !== undefined && Number(next) > max) {
        return
      }
    }

    setVal(next)
  })

  const handleConfirm = useMemoizedFn(() => {
    let finalVal = displayVal
    if (min !== undefined && finalVal !== '' && Number(finalVal) < min) {
      finalVal = String(min)
      setVal(finalVal)
    }
    if (max !== undefined && finalVal !== '' && Number(finalVal) > max) {
      finalVal = String(max)
      setVal(finalVal)
    }
    onConfirm?.(finalVal)
    onClose()
  })

  const handlePresetClick = useMemoizedFn((presetVal: string | number) => {
    setVal(String(presetVal))
  })

  // 4. ahooks useKeyPress: 键盘打开时，支持电脑/外接键盘按键无缝输入
  useKeyPress(
    [
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '.',
      'Backspace',
      'Enter',
      'Escape',
    ],
    (event) => {
      if (!open) return
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'Enter') {
        handleConfirm()
      } else if (event.key === 'Backspace') {
        handleKey('backspace')
      } else if (event.key === '.') {
        handleKey('.')
      } else if (/^[0-9]$/.test(event.key)) {
        handleKey(event.key)
      }
    },
  )

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
          />

          {/* 底部键盘弹层 */}
          <motion.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative z-10 w-full max-w-lg rounded-t-2xl border-t border-[#484b51] bg-[#141517] pb-safe shadow-2xl"
          >
            {/* 拖动条把手 */}
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="h-1 w-10 rounded-full bg-neutral-700" />
            </div>

            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 pb-2 pt-1 border-b border-[#2F3737]">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-wide">
                  {title}
                </h3>
                {description && (
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="关闭"
                onClick={onClose}
                className="flex size-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* 数值回显区域 */}
            <div className="px-4 py-3 bg-[#111213] border-b border-[#2F3737] flex items-center justify-between">
              <div className="flex items-baseline gap-1.5 overflow-hidden">
                <span className="text-2xl font-bold tracking-tight text-white font-mono min-h-8 flex items-center">
                  {displayVal || <span className="text-neutral-600">0</span>}
                  <span className="inline-block w-0.5 h-6 ml-0.5 bg-[#FE810B] animate-pulse" />
                </span>
                {unit && (
                  <span className="text-sm font-medium text-[#FFA546]">
                    {unit}
                  </span>
                )}
              </div>

              {displayVal.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleKey('clear')}
                  className="px-2 py-1 text-xs text-neutral-400 hover:text-[#FE810B] rounded bg-neutral-800/60 hover:bg-neutral-800 transition-colors"
                >
                  清空
                </button>
              )}
            </div>

            {/* 快捷预设选项 */}
            {presets && presets.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto no-scrollbar border-b border-[#2F3737]/60 bg-[#16181a]">
                <span className="text-xs text-neutral-500 shrink-0">预设:</span>
                {presets.map((preset) => {
                  const isSelected = displayVal === String(preset.value)
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handlePresetClick(preset.value)}
                      className={cn(
                        'shrink-0 px-3 py-1 text-xs font-semibold rounded-md border transition-all',
                        isSelected
                          ? 'border-[#FE810B] bg-[#FE810B]/15 text-[#FFA546]'
                          : 'border-neutral-800 bg-[#1c1f21] text-neutral-300 hover:border-neutral-700',
                      )}
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>
            )}

            {/* 键盘按键网格 */}
            <div className="p-3 bg-[#131516]">
              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKey(num)}
                    className="flex h-13.5 items-center justify-center rounded-lg border border-[#2F3737] bg-[#1a1c1e] text-xl font-semibold text-white transition-transform active:scale-[0.97] active:bg-[#25282c] hover:border-neutral-600 select-none shadow-xs"
                  >
                    {num}
                  </button>
                ))}

                {/* 底部功能行 */}
                {allowDecimal ? (
                  <button
                    type="button"
                    onClick={() => handleKey('.')}
                    className="flex h-13.5 items-center justify-center rounded-lg border border-[#2F3737] bg-[#1a1c1e] text-xl font-bold text-white transition-transform active:scale-[0.97] active:bg-[#25282c] select-none"
                  >
                    .
                  </button>
                ) : (
                  <div className="flex h-13.5 items-center justify-center rounded-lg bg-transparent" />
                )}

                <button
                  type="button"
                  onClick={() => handleKey('0')}
                  className="flex h-13.5 items-center justify-center rounded-lg border border-[#2F3737] bg-[#1a1c1e] text-xl font-semibold text-white transition-transform active:scale-[0.97] active:bg-[#25282c] select-none"
                >
                  0
                </button>

                <button
                  type="button"
                  aria-label="退格删除"
                  onClick={() => handleKey('backspace')}
                  className="flex h-13.5 items-center justify-center rounded-lg border border-[#2F3737] bg-[#1a1c1e] text-neutral-300 transition-transform active:scale-[0.97] active:bg-[#25282c] hover:text-white select-none"
                >
                  <Delete className="size-5" />
                </button>
              </div>

              {/* 确认完成按钮 */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/40 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-base font-bold text-white shadow-[0_3px_0_0_#963000] transition-transform active:translate-y-0.5"
                >
                  <Check className="size-5" />
                  <span>完成</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/**
 * 带有移动端数字键盘弹窗的输入框组件
 */
export interface NumericInputProps {
  id?: string
  name?: string
  value?: string | number
  defaultValue?: string | number
  onChange?: (val: string) => void
  onBlur?: () => void
  placeholder?: string
  title?: string
  description?: string
  unit?: string
  allowDecimal?: boolean
  presets?: Array<{ label: string; value: string | number }>
  min?: number
  max?: number
  disabled?: boolean
  className?: string
}

export function NumericInput(props: NumericInputProps) {
  const {
    id,
    name,
    onBlur,
    placeholder = '0',
    title,
    description,
    unit,
    allowDecimal = false,
    presets,
    min,
    max,
    disabled = false,
    className,
  } = props

  // 1. ahooks useBoolean: 优雅管理弹窗显隐
  const [open, { setTrue: openKeypad, setFalse: closeKeypad }] =
    useBoolean(false)

  // 2. ahooks useControllableValue: 支持表单受控与非受控
  const [value, setValue] = useControllableValue<string>(props, {
    defaultValue: '',
  })

  return (
    <>
      <div
        onClick={() => {
          if (!disabled) openKeypad()
        }}
        className={cn(
          'relative flex h-10.5 w-full cursor-pointer items-center justify-between rounded-xs border border-[#84888c] bg-transparent px-3 text-sm text-white transition-colors hover:border-[#FE810B] focus-within:ring-1 focus-within:ring-[#FE810B]',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
      >
        <span
          className={cn(
            'font-mono text-sm',
            !value && value !== '0' ? 'text-[#84888c]' : 'text-white font-medium',
          )}
        >
          {value !== '' && value !== undefined ? String(value) : placeholder}
        </span>

        {unit && (
          <span className="text-xs font-semibold text-[#FE810B]">{unit}</span>
        )}

        {/* 隐藏的真实 input 满足表单 name/id 机制 */}
        <input
          id={id}
          name={name}
          type="hidden"
          value={value ?? ''}
          readOnly
        />
      </div>

      <NumericKeypad
        open={open}
        onClose={() => {
          closeKeypad()
          onBlur?.()
        }}
        value={value}
        onChange={setValue}
        title={title}
        description={description}
        unit={unit}
        allowDecimal={allowDecimal}
        presets={presets}
        min={min}
        max={max}
      />
    </>
  )
}
