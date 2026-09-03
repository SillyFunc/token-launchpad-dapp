import { useState, type ReactNode, type MouseEvent } from 'react'
import { useConnection, useChainId, useSwitchChain } from 'wagmi'
import { useModal } from 'connectkit'
import type { Hex } from 'viem'
import { Loader2, Wallet, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DEFAULT_CHAIN_ID, getTargetChainName } from '@/config/network'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

export interface Web3ActionButtonProps
  extends Omit<React.ComponentProps<typeof Button>, 'onClick'> {
  /**
   * 业务操作执行函数。
   * 触发时入参 address 100% 保证为非空 Hex 钱包地址，且当前网络已处于 targetChainId。
   */
  onAction?: (
    address: Hex,
    event: MouseEvent<HTMLButtonElement>,
  ) => Promise<void> | void
  /** 兼容原生 onClick，参数为 (event, address) */
  onClick?: (event: MouseEvent<HTMLButtonElement>, address: Hex) => Promise<void> | void
  /** 目标网络 chainId，缺省为 DEFAULT_CHAIN_ID */
  targetChainId?: number
  /** 自定义未连接钱包文案，缺省为 '连接钱包' */
  connectWalletText?: string
  /** 自定义切网文案，缺省为 '切换至 {目标网络名}' */
  switchNetworkText?: string
  /** 是否展示执行中 loading 状态 */
  loading?: boolean
  /** loading 状态下的展示文案 */
  loadingText?: ReactNode
}

/**
 * 多态自适应 Web3 操作按钮：
 * 1. 未连钱包 → 自动展示「连接钱包」，点击唤起 ConnectKit；
 * 2. 错网 → 自动展示「切换至 {网络名}」，点击调用钱包切网；
 * 3. 正常环境 → 展示业务 children，点击执行 onAction 并注入强类型非空 address。
 */
export function Web3ActionButton({
  onAction,
  onClick,
  targetChainId = DEFAULT_CHAIN_ID,
  connectWalletText = '连接钱包',
  switchNetworkText,
  loading = false,
  loadingText,
  disabled,
  children,
  className,
  variant = 'default',
  size = 'default',
  type = 'button',
  ...rest
}: Web3ActionButtonProps) {
  const { address, isConnected } = useConnection()
  const chainId = useChainId()
  const { setOpen } = useModal()
  const { switchChainAsync, isPending: isSwitchingPending } = useSwitchChain()
  const [localSwitching, setLocalSwitching] = useState(false)

  const isSwitching = isSwitchingPending || localSwitching
  const targetName = getTargetChainName(targetChainId)

  // 1. 未连接钱包状态
  if (!isConnected || !address) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn('font-bold', className)}
        onClick={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
      >
        <Wallet className="size-4" />
        <span>{connectWalletText}</span>
      </Button>
    )
  }

  // 2. 网络不匹配状态
  if (chainId !== targetChainId) {
    return (
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled={isSwitching}
        className={cn(
          'border-amber-500/60 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 hover:text-amber-200 font-bold',
          className,
        )}
        onClick={async (e) => {
          e.preventDefault()
          setLocalSwitching(true)
          try {
            await switchChainAsync({ chainId: targetChainId })
            toast.success(`已切换至 ${targetName}`)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : ''
            if (!msg.includes('rejected') && !msg.includes('User rejected')) {
              toast.error(`切换网络失败，请在钱包中手动切换至 ${targetName}`)
            }
          } finally {
            setLocalSwitching(false)
          }
        }}
      >
        {isSwitching ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        <span>
          {isSwitching
            ? '正在切换网络…'
            : switchNetworkText || `切换至 ${targetName}`}
        </span>
      </Button>
    )
  }

  // 3. 就绪状态：执行业务逻辑，注入非空 address
  const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
    if (!address) return
    const hexAddress = address as Hex
    if (onAction) {
      await onAction(hexAddress, e)
    }
    if (onClick) {
      await onClick(e, hexAddress)
    }
  }

  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      disabled={disabled || loading}
      className={className}
      onClick={handleClick}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          <span>{loadingText || children}</span>
        </>
      ) : (
        children
      )}
    </Button>
  )
}

/**
 * 非按钮交互场景（如表单提交、弹窗确认）的高阶执行器 Hook
 */
export function useWeb3Action(targetChainId: number = DEFAULT_CHAIN_ID) {
  const { address, isConnected } = useConnection()
  const chainId = useChainId()
  const { setOpen } = useModal()
  const { switchChainAsync } = useSwitchChain()

  const execute = async <T,>(
    action: (userAddress: Hex) => Promise<T>,
  ): Promise<T | undefined> => {
    if (!address || !isConnected) {
      setOpen(true)
      return undefined
    }

    if (chainId !== targetChainId) {
      try {
        await switchChainAsync({ chainId: targetChainId })
      } catch {
        toast.error(`请切换网络至 ${getTargetChainName(targetChainId)}`)
        return undefined
      }
    }

    return await action(address as Hex)
  }

  return {
    address: address as Hex | undefined,
    isConnected,
    isCorrectNetwork: chainId === targetChainId,
    execute,
  }
}
