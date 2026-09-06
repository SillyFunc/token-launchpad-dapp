import type { AnyFieldApi } from '@tanstack/react-form'

export function FieldInfo({ field }: { field: AnyFieldApi }) {
  const errors = field.state.meta.errors
    .map((error) =>
      typeof error === 'string'
        ? error
        : (error as { message?: unknown }).message,
    )
    .filter((message): message is string => typeof message === 'string')

  if (errors.length === 0) return null
  return <p className="mt-1 text-xs text-[#FF4A55]">{errors.join(', ')}</p>
}
