import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useConnection } from 'wagmi'
import { type Hex } from 'viem'

import { getTokenByContractAddress, getTokenDetailById } from '@/api/token'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import titleBackArrow from '@/assets/icons/back-arrow.svg'

import { TokenInfoHeader } from '@/components/presale/token-info-header'
import { BlockedState } from '@/components/presale/blocked-state'
import { PresaleForm } from '@/components/presale/presale-form'
import { useTokenGate } from '@/hooks/use-token-gate'

export const Presale = () => {
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id')
  const rawAddress = searchParams.get('address') || ''
  const tokenAddress = rawAddress as Hex
  const hasParam = Boolean(id || tokenAddress)
  const { address } = useConnection()

  // 后端代币详情（根据 id 或合约地址拉取）
  const {
    data: token,
    isLoading: isTokenLoading,
    isError: isTokenError,
  } = useQuery({
    queryKey: ['tokenDetail', id || tokenAddress],
    queryFn: () =>
      id ? getTokenDetailById(id) : getTokenByContractAddress(tokenAddress),
    enabled: hasParam,
  })

  const effectiveAddress =
    tokenAddress || (token?.coinContractAddress as Hex | undefined)

  // 统一代币门禁守卫
  const { canSetupPresale } = useTokenGate({
    tokenAddress: effectiveAddress,
    token,
  })

  return (
    <div className="relative mx-auto flex w-full flex-col pb-28 pt-6">
      <div className="mb-4 flex shrink-0 items-center gap-3">
        <button
          type="button"
          aria-label="返回"
          onClick={() => window.history.back()}
          className="flex size-6 shrink-0 items-center justify-center rounded-xs hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B]"
        >
          <img
            src={titleBackArrow}
            alt=""
            aria-hidden="true"
            className="size-full object-cover"
          />
        </button>
        <span className="text-lg font-semibold tracking-wide text-white">
          配置预售信息
        </span>
      </div>

      <Card className="overflow-visible border border-[#484b51] bg-[#131516] ring-0">
        <CardHeader className="border-b border-b-[#484b51]">
          <TokenInfoHeader
            tokenAddress={effectiveAddress || ''}
            token={token}
            isLoading={isTokenLoading}
            isError={isTokenError}
          />
        </CardHeader>

        <CardContent>
          {canSetupPresale.allowed && address ? (
            <PresaleForm
              key={token?.id || effectiveAddress || 'presale'}
              token={token}
              tokenAddress={effectiveAddress || ''}
              address={address}
            />
          ) : (
            <BlockedState
              reason={canSetupPresale.reason ?? ''}
              isLoading={canSetupPresale.isLoading || isTokenLoading}
              primaryAction={canSetupPresale.primaryAction}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
