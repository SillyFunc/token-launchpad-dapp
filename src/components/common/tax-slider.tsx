import { useId } from 'react'

export interface TaxSliderProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  required?: boolean
  id?: string
}

export function TaxSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
  required = false,
  id,
}: TaxSliderProps) {
  const generatedId = useId()
  const inputId = id ?? `tax-slider-${generatedId.replace(/:/g, '')}`
  const safeValue = Number.isFinite(value) ? value : min
  const range = max - min
  const progress =
    range > 0
      ? Math.min(100, Math.max(0, ((safeValue - min) / range) * 100))
      : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="flex items-center gap-0.5 text-sm text-white">
          <span>{label}</span>
          {required && (
            <span aria-hidden="true" className="text-sm text-[#f7594b]">
              *
            </span>
          )}
        </label>
        <output
          htmlFor={inputId}
          className="flex h-8 w-12 items-center justify-center rounded border border-white/30 bg-[#141517] text-sm font-bold text-[#FB5F16]"
        >
          {safeValue}%
        </output>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-white">
          <span>{min}%</span>
          <span>{max}%</span>
        </div>
        <div className="relative flex items-center rounded py-1">
          <div className="h-1 w-full rounded-full bg-[#2F3737]" aria-hidden="true">
            <div
              className="h-1 rounded-full bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <input
            id={inputId}
            type="range"
            min={min}
            max={max}
            step={step}
            value={safeValue}
            required={required}
            aria-label={label}
            onChange={(event) => onChange(Number(event.currentTarget.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus:outline-none focus-visible:outline-none focus:ring-0"
          />
          <div
            className="pointer-events-none absolute h-3.5 w-2 -translate-x-1/2 rounded-xs bg-[#FB5F16]"
            style={{ left: `${progress}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  )
}
