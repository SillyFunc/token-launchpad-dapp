import type { ComponentProps } from 'react'
import { cn } from 'cn'

/** 表单输入框统一外观；右侧后缀（如单位）用 `rightAdornment` 传入 */
export function FormInput({
  rightAdornment,
  className,
  ...props
}: ComponentProps<'input'> & { rightAdornment?: React.ReactNode }) {
  const inputClass = cn(
    'box-border h-10.5 w-full appearance-none rounded-xs border border-[#84888c] bg-transparent px-3 text-sm text-white placeholder:text-[#84888c] focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B] disabled:cursor-not-allowed disabled:opacity-50',
    className,
  )

  if (!rightAdornment) {
    return <input className={inputClass} {...props} />
  }

  return (
    <div className="relative">
      <input className={cn(inputClass, 'pr-10')} {...props} />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-[#FE810B]">
        {rightAdornment}
      </span>
    </div>
  )
}
