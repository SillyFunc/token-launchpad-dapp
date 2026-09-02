import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConnection, useReadContract } from 'wagmi'
import { type Abi } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { Coins, RefreshCw, Wallet } from 'lucide-react'

import { getTokensByCreator, type TokenDetail } from '@/api/token'
import { Button } from '@/components/ui/button'
import { EditTokenModal } from '@/components/dashboard/edit-token-modal'
import { IssueTokenModal } from '@/components/dashboard/issue-token-modal'
import { TokenCard } from '@/components/dashboard/token-card'
import FlapTaxTokenV3AbiJson from '@/contracts/abi/FlapTaxTokenV3.json'
import { formatTokenSupply } from '@/lib/format'
import { useLocale } from '@/lib/i18n'
import titleBackArrow from '@/assets/icons/back-arrow.svg'

const FlapTaxTokenV3Abi = FlapTaxTokenV3AbiJson as unknown as Abi

export const Dashboard = () => {
  const { address } = useConnection()
  const { locale } = useLocale()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editingToken, setEditingToken] = useState<TokenDetail | null>(null)
  const [issuingToken, setIssuingToken] = useState<TokenDetail | null>(null)

  const {
    data: tokens,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['creatorTokens', address],
    queryFn: () => getTokensByCreator(address!),
    enabled: Boolean(address),
  })

  const tokenList = Array.isArray(tokens) ? tokens : []

  const firstIssued = tokenList.find((t) => t.coinContractAddress)
  const totalSupplyData = useReadContract({
    address: firstIssued?.coinContractAddress as `0x${string}` | undefined,
    abi: FlapTaxTokenV3Abi,
    functionName: 'totalSupply',
    chainId: 97,
    query: {
      enabled: Boolean(firstIssued),
      staleTime: Infinity,
    },
  }).data as bigint | undefined
  const totalSupplyText =
    totalSupplyData !== undefined && totalSupplyData !== null
      ? formatTokenSupply(totalSupplyData, locale)
      : '--'

  const handlePresale = (token: TokenDetail) => {
    const tokenAddr = token.coinContractAddress
    if (tokenAddr) navigate(`/presale?address=${tokenAddr}`)
  }

  const handleLaunch = (token: TokenDetail) => {
    setIssuingToken(token)
  }

  const handleClaim = () => {
    void refetch()
  }

  return (
    <div className="relative mx-auto flex w-full flex-col pb-24 pt-6 text-white">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
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
          <div>
            <h1 className="text-lg font-bold tracking-wide text-white">
              控制台 / 我的代币
            </h1>
            <p className="text-xs text-neutral-400">
              管理您创建的代币，发起预售或修改相关配置
            </p>
          </div>
        </div>

        {address && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isLoading || isRefetching}
            className="cursor-pointer rounded border-[#484b51] bg-[#131516] text-xs text-neutral-300 hover:bg-white/10"
          >
            <RefreshCw
              className={`size-3.5 ${isRefetching ? 'animate-spin' : ''}`}
            />
            <span>刷新</span>
          </Button>
        )}
      </div>

      {!address && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#484b51] bg-[#131516] p-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[#FE810B]/10 text-[#FE810B]">
            <Wallet className="size-7" />
          </div>
          <h2 className="mb-1 text-base font-bold text-white">
            请先连接您的钱包
          </h2>
          <p className="mb-6 max-w-sm text-xs text-neutral-400">
            连接钱包后即可查看并管理您所发行的所有代币资产与预售进度
          </p>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button
                type="button"
                onClick={show}
                className="cursor-pointer rounded-md border border-[#FE810B] bg-[#FD810B1A] px-6 py-2 text-sm font-semibold text-white transition-all active:translate-y-0.5 hover:bg-[#FD810B33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFA546]"
              >
                连接钱包
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      )}

      {address && isLoading && (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-64 animate-pulse space-y-4 rounded-lg border border-[#2F3737] bg-[#131516] p-4"
            >
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-lg bg-neutral-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 rounded bg-neutral-800" />
                  <div className="h-3 w-36 rounded bg-neutral-800" />
                </div>
              </div>
              <div className="h-12 rounded bg-neutral-800/60" />
              <div className="h-16 rounded bg-neutral-800/40" />
            </div>
          ))}
        </div>
      )}

      {address && !isLoading && isError && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#484b51] bg-[#131516] p-12 text-center">
          <p className="mb-4 text-sm text-red-400">
            获取代币列表失败，请稍后重试
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            className="rounded border-[#484b51] bg-[#1a1c1e] text-xs text-white"
          >
            重新加载
          </Button>
        </div>
      )}

      {address && !isLoading && !isError && tokenList.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#484b51] bg-[#131516] p-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-neutral-800 text-neutral-400">
            <Coins className="size-7" />
          </div>
          <h2 className="mb-1 text-base font-bold text-white">
            暂无发行的代币
          </h2>
          <p className="mb-6 max-w-sm text-xs text-neutral-400">
            您还没有创建过任何代币。立即创建属于您的代币并启动预售吧！
          </p>
          <Link
            to="/launch"
            className="cursor-pointer rounded-md bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] px-6 py-2 text-sm font-semibold text-white shadow-[0_3px_0_0_#963000] transition-all active:translate-y-0.5"
          >
            创建第一个代币
          </Link>
        </div>
      )}

      {address && !isLoading && !isError && tokenList.length > 0 && (
        <div className="flex flex-col gap-4">
          {tokenList.map((token) => (
            <TokenCard
              key={token.id || token.coinContractAddress}
              token={token}
              totalSupplyText={totalSupplyText}
              onEdit={(t) => setEditingToken(t)}
              onPresale={handlePresale}
              onLaunch={handleLaunch}
              onClaim={handleClaim}
            />
          ))}
        </div>
      )}

      {editingToken && (
        <EditTokenModal
          token={editingToken}
          onClose={() => setEditingToken(null)}
          onSuccess={() => void refetch()}
        />
      )}

      {issuingToken && (
        <IssueTokenModal
          token={issuingToken}
          onClose={() => setIssuingToken(null)}
          onSuccess={(tokenAddress) => {
            queryClient.setQueryData(
              ['creatorTokens', address],
              (old: unknown) => {
                if (!Array.isArray(old)) return old
                return old.map((t: TokenDetail) =>
                  t.id === issuingToken.id
                    ? { ...t, coinContractAddress: tokenAddress as string }
                    : t,
                )
              },
            )
          }}
        />
      )}
    </div>
  )
}