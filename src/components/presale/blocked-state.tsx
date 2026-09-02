import { Link } from 'react-router'
import { Loader2, ShieldX, ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface BlockedAction {
  label: string
  to: string
}

interface BlockedStateProps {
  reason: string
  isLoading?: boolean
  primaryAction?: BlockedAction
}

/**
 * 阻塞态内容 — 当代币不满足开启预售的前置条件时展示。
 * 仅提示 + 引导跳转，不渲染任何表单。Card 容器由父组件提供。
 */
export function BlockedState({
  reason,
  isLoading = false,
  primaryAction,
}: BlockedStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
        {isLoading ? (
          <Loader2 className="size-7 animate-spin" />
        ) : (
          <ShieldX className="size-7" />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-bold text-white">
          {isLoading ? '正在校验链上状态…' : '暂不可配置预售'}
        </h3>
        {!isLoading && reason && (
          <p className="max-w-sm text-xs leading-relaxed text-neutral-400">
            {reason}
          </p>
        )}
      </div>

      {!isLoading && primaryAction && (
        <Button
          nativeButton={false}
          className="mt-2 h-10 w-full max-w-xs"
          render={<Link to={primaryAction.to} />}
        >
          <ArrowLeft className="size-3.5" />
          {primaryAction.label}
        </Button>
      )}
    </div>
  )
}
