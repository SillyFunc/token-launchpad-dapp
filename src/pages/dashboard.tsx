import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConnection, useConfig, useReadContract } from 'wagmi'
import { signMessage, writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { zeroAddress, type Abi } from 'viem'
import { ConnectKitButton } from 'connectkit'
import {
  Coins,
  Copy,
  Check,
  ExternalLink,
  Edit3,
  Gift,
  Rocket,
  RefreshCw,
  Globe,
  Send,
  Clock,
  ShieldCheck,
  Percent,
  Wallet,
  Loader2,
} from 'lucide-react'

import { getTokensByCreator, type TokenDetail } from '@/api/token'
import { getSignMessage } from '@/api/auth'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { EditTokenModal } from '@/components/dashboard/edit-token-modal'
import { IssueTokenModal } from '@/components/dashboard/issue-token-modal'
import FlapTaxTokenV3AbiJson from '@/contracts/abi/FlapTaxTokenV3.json'
import PresaleAbiJson from '@/contracts/abi/Presale.json'
import CoordinatorFactoryAbiJson from '@/contracts/abi/CoordinatorFactory.json'
import { CONTRACT_ADDRESSES } from '@/contracts/addresses'
import { formatAddress, formatTokenSupply } from '@/lib/format'
import { useLocale } from '@/lib/i18n'
import titleBackArrow from '@/assets/icons/back-arrow.svg'

const FlapTaxTokenV3Abi = FlapTaxTokenV3AbiJson as unknown as Abi
const PresaleAbi = PresaleAbiJson as unknown as Abi
const CoordinatorFactoryAbi = CoordinatorFactoryAbiJson as unknown as Abi

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function TokenCard({
  token,
  totalSupplyText,
  onEdit,
  onPresale,
  onLaunch,
  onClaim,
}: {
  token: TokenDetail
  totalSupplyText: string
  onEdit: (token: TokenDetail) => void
  onPresale: (token: TokenDetail) => void
  onLaunch: (token: TokenDetail) => void
  onClaim: (token: TokenDetail) => void
}) {
  const { address: connectedAddress } = useConnection()
  const config = useConfig()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const isIssued = Boolean(token.coinContractAddress)
  const tokenAddress = token.coinContractAddress || ''

  const presaleAddress = useReadContract({
    address: CONTRACT_ADDRESSES[97].coordinatorFactory,
    abi: CoordinatorFactoryAbi,
    functionName: 'getTokenPresale',
    args: [tokenAddress as `0x${string}`],
    chainId: 97,
    query: { enabled: isIssued, staleTime: 30_000 },
  }).data as `0x${string}` | undefined

  const presaleExists = Boolean(
    presaleAddress && presaleAddress !== zeroAddress,
  )

  const launchStatus = useReadContract({
    address: presaleAddress && presaleExists ? presaleAddress : undefined,
    abi: PresaleAbi,
    functionName: 'getLaunchStatus',
    chainId: 97,
    query: { enabled: presaleExists, staleTime: 30_000 },
  }).data as
    | readonly [boolean, bigint, bigint, bigint, boolean, boolean]
    | undefined

  const presaleOwner = useReadContract({
    address: presaleAddress && presaleExists ? presaleAddress : undefined,
    abi: PresaleAbi,
    functionName: 'owner',
    chainId: 97,
    query: { enabled: presaleExists, staleTime: 30_000 },
  }).data as `0x${string}` | undefined

  const tokensClaimed = Boolean(launchStatus && launchStatus[5])

  const showClaimButton = Boolean(
    presaleExists &&
    launchStatus &&
    !launchStatus[0] && // enabled
    !tokensClaimed &&
    presaleOwner === connectedAddress, // isCreator
  )

  const handleCopy = () => {
    if (!tokenAddress) return
    void navigator.clipboard.writeText(tokenAddress)
    setCopied(true)
    toast.success('已复制到剪贴板')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClaimTokens = async () => {
    if (!connectedAddress || !presaleAddress) return
    if (launchStatus && launchStatus[0]) {
      toast.error('预售已开启，无法领取代币')
      return
    }
    if (launchStatus && launchStatus[5]) {
      toast.error('代币已领取，不可重复领取')
      return
    }
    setIsClaiming(true)
    try {
      const message = await getSignMessage(connectedAddress)
      await signMessage(config, { message })
      const hash = await writeContract(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'claimAllTokens',
        chainId: 97,
      })
      await waitForTransactionReceipt(config, { hash, chainId: 97 })
      queryClient.invalidateQueries()
      toast.success('请关注您钱包里的代币余额', '领取成功')
      onClaim(token)
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : '代币领取失败，请稍后重试'
      toast.error(msg, '领取失败')
    } finally {
      setIsClaiming(false)
    }
  }

  return (
    <Card className="flex flex-col justify-between overflow-hidden rounded-lg border border-[#484b51] bg-[#131516] p-0 text-white shadow-lg transition-all hover:border-[#FE810B]/60">
      <div>
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-[#2F3737] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#484b51] bg-[#1a1c1e]">
              {token.coinImg ? (
                <img
                  src={token.coinImg}
                  alt={token.name}
                  className="size-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <Coins className="size-6 text-[#FFA546]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <CardTitle className="truncate text-base font-bold text-white">
                  {token.name}
                </CardTitle>
                <span className="shrink-0 rounded bg-[#FE810B]/15 px-2 py-0.5 text-xs font-semibold text-[#FFA546]">
                  &#36;{token.symbol}
                </span>
              </div>
              <CardDescription className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                <span>
                  CA: {tokenAddress ? formatAddress(tokenAddress) : '暂未发行'}
                </span>
                {tokenAddress && (
                  <>
                    <button
                      type="button"
                      aria-label="复制地址"
                      onClick={handleCopy}
                      className="cursor-pointer text-neutral-400 transition-colors hover:text-white"
                    >
                      {copied ? (
                        <Check className="size-3 text-green-400" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                    <a
                      href={`https://testnet.bscscan.com/address/${tokenAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-neutral-400 transition-colors hover:text-[#FFA546]"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  </>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 p-4">
          <p className="min-h-8 text-xs text-neutral-400 line-clamp-2">
            {token.meta || token.zhIntroduction || '暂无代币描述信息'}
          </p>

          <div className="flex flex-col divide-y divide-[#2F3737]/60 rounded-md border border-[#2F3737] bg-[#17191b] px-3 py-1 text-xs">
            <div className="flex items-center justify-between py-2">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <Percent className="size-3.5 text-[#FE810B]" />
                买入 / 卖出税率
              </span>
              <span className="font-semibold text-white">
                {token.buyTax ?? 0}% / {token.sellTax ?? 0}%
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <Clock className="size-3.5 text-[#FE810B]" />
                税费存续期
              </span>
              <span className="font-semibold text-white">
                {token.taxDuration ? `${token.taxDuration} 天` : '--'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <ShieldCheck className="size-3.5 text-[#FE810B]" />
                防「挖、提、卖」保护期
              </span>
              <span className="font-semibold text-white">
                {token.antiFarmerDuration !== undefined &&
                token.antiFarmerDuration !== null
                  ? `${token.antiFarmerDuration} 天`
                  : '--'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <Coins className="size-3.5 text-[#FE810B]" />
                发行总量
              </span>
              <span
                className={
                  token.coinContractAddress
                    ? 'font-semibold text-white'
                    : 'font-normal text-neutral-400'
                }
              >
                {token.coinContractAddress ? totalSupplyText : '暂未发行'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <Wallet className="size-3.5 text-[#FE810B]" />
                税费接收地址
              </span>
              <span className="font-mono text-white">
                {formatAddress(token.feeRecipient)}
              </span>
            </div>
          </div>

          {(token.website || token.twitter || token.telegram) && (
            <div className="flex items-center gap-3 pt-1 text-xs text-neutral-400">
              {token.website && (
                <a
                  href={token.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 transition-colors hover:text-[#FFA546]"
                >
                  <Globe className="size-3.5" />
                  <span>官网</span>
                </a>
              )}
              {token.twitter && (
                <a
                  href={token.twitter}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 transition-colors hover:text-[#FFA546]"
                >
                  <TwitterIcon className="size-3.5" />
                  <span>Twitter</span>
                </a>
              )}
              {token.telegram && (
                <a
                  href={token.telegram}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 transition-colors hover:text-[#FFA546]"
                >
                  <Send className="size-3.5" />
                  <span>TG 频道</span>
                </a>
              )}
            </div>
          )}
        </CardContent>
      </div>

      {(isIssued ? showClaimButton || !tokensClaimed : true) && (
        <CardFooter className="flex items-center justify-end gap-2.5 border-t border-[#2F3737] bg-[#16181a] p-3">
          {!isIssued && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEdit(token)}
              className="cursor-pointer rounded border-[#484b51] bg-[#1a1c1e] text-xs font-semibold text-neutral-200 hover:bg-[#25282c] hover:text-white"
            >
              <Edit3 className="size-3.5" />
              编辑信息
            </Button>
          )}
          {isIssued ? (
            <>
              {showClaimButton && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClaimTokens}
                  disabled={isClaiming}
                  className="cursor-pointer rounded border-[#484b51] bg-[#1a1c1e] text-xs font-semibold text-neutral-200 hover:bg-[#25282c] hover:text-white"
                >
                  {isClaiming ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Gift className="size-3.5" />
                  )}
                  {isClaiming ? '领取中…' : '领取代币'}
                </Button>
              )}
              {!tokensClaimed && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onPresale(token)}
                  className="cursor-pointer rounded bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5"
                >
                  <Rocket className="size-3.5" />
                  我要预售
                </Button>
              )}
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => onLaunch(token)}
              className="cursor-pointer rounded border border-white/40 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5"
            >
              <Rocket className="size-3.5" />
              我要发行
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  )
}

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
    // const tokenAddr = token.coinContractAddress || ''
    // navigate(`/presale?address=${tokenAddr}`)
  }

  const handleLaunch = (token: TokenDetail) => {
    setIssuingToken(token)
  }

  // 领取代币成功后的回调
  const handleClaim = () => {
    void refetch()
  }

  return (
    <div className="relative mx-auto flex w-full flex-col pb-24 pt-6 text-white">
      {/* 顶部标题栏 */}
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

      {/* 钱包未连接状态 */}
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

      {/* 加载中状态 */}
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

      {/* 请求出错状态 */}
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

      {/* 空列表状态 */}
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

      {/* 代币卡片列表 */}
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

      {/* 编辑代币信息弹窗 */}
      {editingToken && (
        <EditTokenModal
          token={editingToken}
          onClose={() => setEditingToken(null)}
          onSuccess={() => void refetch()}
        />
      )}

      {/* 链上发行确认弹窗 */}
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
