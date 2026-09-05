import { useNavigate } from 'react-router'
import titleBackArrow from '@/assets/icons/back-arrow.svg'

export interface PageBackTitleProps {
  title: string
  onBack?: () => void
}
export const PageBackTitle = ({ title, onBack }: PageBackTitleProps) => {
  const nav = useNavigate()
  return (
    <div className="flex items-center gap-3 mt-6 mb-4">
      <button
        type="button"
        aria-label="返回"
        onClick={onBack || (() => nav(-1))}
        className="flex size-6 shrink-0 items-center justify-center rounded-xs hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B]"
      >
        <img
          src={titleBackArrow}
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover"
        />
      </button>
      <span className="text-lg font-semibold text-white tracking-wide">
        {title}
      </span>
    </div>
  )
}
