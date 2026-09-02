import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useConnection } from 'wagmi'
import { type Hex } from 'viem'

import { getTokenByContractAddress } from '@/api/token'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import titleBackArrow from '@/assets/icons/back-arrow.svg'

import { TokenInfoHeader } from '@/components/presale/token-info-header'
import { BlockedState } from '@/components/presale/blocked-state'
import { PresaleForm } from '@/components/presale/presale-form'
import { useTokenGate } from '@/hooks/use-token-gate'

export const Presale = () => {
  const [searchParams] = useSearchParams()
  const tokenAddress = (searchParams.get('address') || '') as Hex
  const hasTokenParam = Boolean(tokenAddress)
  const { address } = useConnection()

  // 后端代币详情（用于头部展示）
  const {
    data: token,
    isLoading: isTokenLoading,
    isError: isTokenError,
  } = useQuery({
    queryKey: ['tokenDetail', tokenAddress],
    queryFn: () => getTokenByContractAddress(tokenAddress),
    enabled: hasTokenParam,
  })

  // 统一代币门禁守卫
  const { canSetupPresale } = useTokenGate({
    tokenAddress,
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
          配置预售条款
        </span>
      </div>

      <Card className="overflow-visible border border-[#484b51] bg-[#131516] ring-0">
        <CardHeader className="border-b border-b-[#484b51]">
          <TokenInfoHeader
            tokenAddress={tokenAddress}
            token={token}
            isLoading={isTokenLoading}
            isError={isTokenError}
          />
        </CardHeader>

        <CardContent>
          {canSetupPresale.allowed && address ? (
            <PresaleForm tokenAddress={tokenAddress} address={address} />
          ) : (
            <BlockedState
              reason={canSetupPresale.reason ?? ''}
              isLoading={canSetupPresale.isLoading}
              primaryAction={canSetupPresale.primaryAction}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
