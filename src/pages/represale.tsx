import { useQuery } from '@tanstack/react-query'
import { useConnection } from 'wagmi'
import { isAddress, type Hex } from 'viem'
import { useNavigate, useSearchParams } from 'react-router'

import { getTokenByContractAddress, getTokenDetailById } from '@/api/token'
import { BlockedState } from '@/components/presale/blocked-state'
import { RepresaleForm } from '@/components/presale/represale-form'
import { TokenInfoHeader } from '@/components/presale/token-info-header'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import titleBackArrow from '@/assets/icons/back-arrow.svg'
import { useTokenGate } from '@/hooks/use-token-gate'

export function Represale() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { address } = useConnection()
  const id = searchParams.get('id')
  const rawAddress = searchParams.get('address') || ''
  const tokenAddress = isAddress(rawAddress) ? (rawAddress as Hex) : undefined
  const hasParam = Boolean(id || tokenAddress)

  const {
    data: token,
    isLoading: isTokenLoading,
    isError: isTokenError,
  } = useQuery({
    queryKey: ['tokenDetail', id || tokenAddress],
    queryFn: () =>
      id
        ? getTokenDetailById(id)
        : getTokenByContractAddress(tokenAddress as string),
    enabled: hasParam,
  })

  const effectiveAddress = tokenAddress || (token?.coinContractAddress as Hex | undefined)
  const gate = useTokenGate({ tokenAddress: effectiveAddress, token, watch: true })
  const canRepresale = Boolean(
    address &&
      effectiveAddress &&
      gate.presaleAddress &&
      gate.isIssued &&
      gate.tokenExists &&
      gate.isCreator &&
      gate.presaleEnabled &&
      gate.presaleStatus === 4 &&
      gate.bnbAccumulated === 0n,
  )

  let blockedReason = '当前代币不满足重开预售条件'
  if (!address) blockedReason = '请先连接创建者钱包'
  else if (gate.presaleStatus === 4 && gate.bnbAccumulated > 0n) {
    blockedReason = '仍有认购者未退款，请等待未退款金额清零后再重开预售'
  } else if (!gate.isCreator) blockedReason = '仅代币创建者可以重开预售'
  else if (gate.presaleStatus !== undefined && gate.presaleStatus !== 4) {
    blockedReason = '只有发行失败状态可以重开预售'
  }

  return (
    <div className="relative mx-auto flex w-full flex-col pb-28 pt-6">
      <div className="mb-4 flex shrink-0 items-center gap-3">
        <button
          type="button"
          aria-label="返回"
          onClick={() => navigate('/dashboard')}
          className="flex size-6 shrink-0 items-center justify-center rounded-xs hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B]"
        >
          <img src={titleBackArrow} alt="" aria-hidden="true" className="size-full object-cover" />
        </button>
        <span className="text-lg font-semibold tracking-wide text-white">重开预售</span>
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
          {canRepresale && gate.presaleAddress && address ? (
            <RepresaleForm
              key={`${effectiveAddress}-${gate.presaleAddress}`}
              token={token ?? null}
              presaleAddress={gate.presaleAddress}
              address={address as Hex}
              gate={gate}
              onSuccess={() => navigate('/dashboard')}
            />
          ) : (
            <BlockedState
              title="暂不能重开预售"
              reason={blockedReason}
              isLoading={isTokenLoading || gate.isChainLoading}
              primaryAction={{ label: '返回控制台', to: '/dashboard' }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
