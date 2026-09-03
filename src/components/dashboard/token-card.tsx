import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConnection, useConfig } from 'wagmi'
import { signMessage, writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { formatEther } from 'viem'
import {
  Coins,
  Copy,
  Check,
  ExternalLink,
  Edit3,
  Gift,
  Rocket,
  Loader2,
  Globe,
  Send,
  Clock,
  ShieldCheck,
  Percent,
  Wallet,
} from 'lucide-react'

import type { TokenDetail } from '@/api/token'
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
import { formatAddress } from '@/lib/format'
import { PresaleAbi } from '@/contracts/abi'
import {
  useTokenGate,
  resolveTokenStage,
  type TokenCardStage,
} from '@/hooks/use-token-gate'
import { DEFAULT_CHAIN_ID, getExplorerUrl } from '@/config/network'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

const STAGE_CONFIG: Record<
  TokenCardStage,
  { label: string; className: string }
> = {
  draft: {
    label: '未发行',
    className: 'border-neutral-700 bg-neutral-800/80 text-neutral-400',
  },
  syncing: {
    label: '同步中',
    className: 'border-blue-800/40 bg-blue-950/30 text-blue-400',
  },
  claim_or_setup: {
    label: '待配置预售',
    className: 'border-amber-800/40 bg-amber-950/30 text-amber-400',
  },
  open_presale: {
    label: '待开启预售',
    className: 'border-orange-800/40 bg-orange-950/30 text-[#FFA546]',
  },
  presale_live: {
    label: '预售认购中',
    className: 'border-emerald-800/40 bg-emerald-950/30 text-emerald-400',
  },
  end_presale: {
    label: '已达软顶',
    className: 'border-green-800/40 bg-green-950/30 text-green-400',
  },
  launch: {
    label: '待开盘上线',
    className: 'border-purple-800/40 bg-purple-950/30 text-purple-400',
  },
  failed: {
    label: '预售失败',
    className: 'border-red-800/40 bg-red-950/30 text-red-400',
  },
  terminal: {
    label: '已完结',
    className: 'border-neutral-700 bg-neutral-800/60 text-neutral-400',
  },
}

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

export interface TokenCardProps {
  token: TokenDetail
  totalSupplyText: string
  onEdit: (token: TokenDetail) => void
  onPresale: (token: TokenDetail) => void
  onOpenPresale: (token: TokenDetail) => void
  onLaunch: (token: TokenDetail) => void
  onClaim: (token: TokenDetail) => void
}

export function TokenCard({
  token,
  totalSupplyText,
  onEdit,
  onPresale,
  onOpenPresale,
  onLaunch,
  onClaim,
}: TokenCardProps) {
  const { address: connectedAddress } = useConnection()
  const config = useConfig()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)

  // 统一代币门禁守卫
  const {
    isIssued,
    isChainLoading,
    presaleAddress,
    presaleConfigured,
    presaleEnabled,
    presaleStatus,
    tokensClaimed,
    bnbAccumulated,
    tokensSubscribed,
    presaleShare,
    softCap,
    hardCap,
    isSoftCapReached: rawSoftCapReached,
    isSoldOut,
    canEdit,
    canIssue,
    canClaimAll,
    canSetupPresale,
    canEndPresale,
    canLaunch,
  } = useTokenGate({ token })

  const bnbAccumulatedNum = Number(formatEther(bnbAccumulated))
  const tokensSubscribedNum = Number(formatEther(tokensSubscribed))
  const presaleShareNum =
    presaleShare > 0n
      ? Number(formatEther(presaleShare))
      : 500_000

  const tokenSalesPercent =
    presaleShareNum > 0
      ? Math.min(100, Math.round((tokensSubscribedNum / presaleShareNum) * 100))
      : 0

  const softCapNum =
    softCap > 0n
      ? Number(formatEther(softCap))
      : Number(token.softcap || token.soft || 0)
  const hardCapNum =
    hardCap > 0n
      ? Number(formatEther(hardCap))
      : Number(token.hardcap || 0)

  const isSoftCapReached =
    rawSoftCapReached ||
    (softCapNum > 0 && bnbAccumulatedNum >= softCapNum - 0.0001)

  const softCapPercent =
    softCapNum > 0
      ? Math.min(100, Math.round((bnbAccumulatedNum / softCapNum) * 100))
      : 0

  const hardCapPercent =
    hardCapNum > 0
      ? Math.min(100, Math.round((bnbAccumulatedNum / hardCapNum) * 100))
      : 0

  const tokenAddress = token.coinContractAddress || ''

  // 单一状态机收敛生命周期，替代分散的多重布尔判断
  const stage: TokenCardStage = resolveTokenStage({
    isIssued,
    isChainLoading,
    tokensClaimed,
    presaleConfigured,
    presaleStatus,
    isSoftCapReached,
  })

  const handleCopy = () => {
    if (!tokenAddress) return
    void navigator.clipboard.writeText(tokenAddress)
    setCopied(true)
    toast.success('已复制到剪贴板')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClaimTokens = async () => {
    if (!canClaimAll.allowed) {
      toast.error(canClaimAll.reason || '当前不可领取代币')
      return
    }
    if (!connectedAddress || !presaleAddress) return

    setIsClaiming(true)
    try {
      const message = await getSignMessage(connectedAddress)
      await signMessage(config, { message })
      const hash = await writeContract(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'claimAllTokens',
        chainId: DEFAULT_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, { hash, chainId: DEFAULT_CHAIN_ID })
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

  const handlePresaleClick = () => {
    if (!canSetupPresale.allowed && canSetupPresale.reason) {
      toast.warning(canSetupPresale.reason)
    }
    onPresale(token)
  }

  const handleEndPresale = async () => {
    if (!canEndPresale.allowed) {
      toast.error(canEndPresale.reason || '当前不可结束预售')
      return
    }
    if (!connectedAddress || !presaleAddress) {
      toast.error('请先连接钱包')
      return
    }

    setIsEnding(true)
    try {
      const hash = await writeContract(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'endPresale',
        chainId: DEFAULT_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, {
        hash,
        chainId: DEFAULT_CHAIN_ID,
      })
      queryClient.invalidateQueries()
      toast.success('预售已成功结束！已进入待开盘加池阶段')
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : '结束预售失败，请稍后重试'
      toast.error(msg, '结束失败')
    } finally {
      setIsEnding(false)
    }
  }

  const handleLaunchPool = async () => {
    if (!canLaunch.allowed) {
      toast.error('当前状态不可开盘加池')
      return
    }
    if (!connectedAddress || !presaleAddress) return

    setIsLaunching(true)
    try {
      const hash = await writeContract(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'launch',
        chainId: DEFAULT_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, {
        hash,
        chainId: DEFAULT_CHAIN_ID,
      })
      queryClient.invalidateQueries()
      toast.success('代币已成功开盘加池！LP 已永久死锁')
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : '一键开盘失败，请稍后重试'
      toast.error(msg, '开盘失败')
    } finally {
      setIsLaunching(false)
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="复制地址"
                      onClick={handleCopy}
                      className="text-neutral-400 hover:text-white"
                    >
                      {copied ? (
                        <Check className="size-3 text-green-400" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                    <a
                      href={getExplorerUrl(tokenAddress, 'address')}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex size-6 items-center justify-center text-neutral-400 transition-colors hover:text-[#FFA546]"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  </>
                )}
              </CardDescription>
            </div>
          </div>

          <div className="shrink-0">
            <span
              className={cn(
                'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium',
                STAGE_CONFIG[stage].className,
              )}
            >
              {stage === 'terminal'
                ? tokensClaimed
                  ? '代币已领取'
                  : '已上线交易'
                : STAGE_CONFIG[stage].label}
            </span>
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

          {/* 预售实时看板与多维进度条（严格仅在链上开启/配置了预售时展示） */}
          {isIssued && (presaleEnabled || presaleConfigured) && (
            <div className="flex flex-col gap-3 border border-[#2F3737] bg-[#17191b] p-3 text-xs">
              {/* 预售核心盘口参数（一行一条） */}
              <div className="flex flex-col divide-y divide-white/5 border-b border-white/5 pb-1 text-[11px]">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-neutral-400">预售价</span>
                  <span className="font-mono font-medium text-white">
                    {token.presaleTokenPrice
                      ? `${token.presaleTokenPrice} BNB`
                      : '--'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5">
                  <span className="text-neutral-400">单钱包限购</span>
                  <span className="font-mono font-medium text-white">
                    {token.maxBuyPerWallet
                      ? `${token.maxBuyPerWallet} 枚`
                      : '--'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5">
                  <span className="text-neutral-400">已募 BNB</span>
                  <span className="font-mono font-semibold text-[#FFA546]">
                    {bnbAccumulatedNum.toFixed(4)} BNB
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5">
                  <span className="text-neutral-400">已认购代币</span>
                  <span className="font-mono font-medium text-white">
                    {tokensSubscribedNum.toLocaleString()} 枚
                  </span>
                </div>
              </div>

              {/* 进度条 1：50% 预售代币售罄进度 */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-neutral-400">
                    <span className="size-1.5 bg-[#FE810B]" />
                    预售份额售出 (50% 预售池)
                  </span>
                  <span className="font-mono text-neutral-300">
                    <strong className="text-white">
                      {tokensSubscribedNum.toLocaleString()}
                    </strong>{' '}
                    / {presaleShareNum.toLocaleString()} 枚
                    <span
                      className={cn(
                        'ml-1.5 font-semibold',
                        isSoldOut ? 'text-green-400' : 'text-[#FFA546]',
                      )}
                    >
                      ({tokenSalesPercent}%)
                    </span>
                  </span>
                </div>
                <Progress
                  value={tokenSalesPercent}
                  className="h-1.5 w-full bg-[#111213]"
                />
              </div>

              {/* 进度条 2：软顶达成进度 */}
              <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-neutral-400">
                    <span className="size-1.5 bg-[#FFA546]" />
                    预售软顶达标线 (Soft Cap)
                  </span>
                  <span className="font-mono text-neutral-300">
                    <strong className="text-white">
                      {bnbAccumulatedNum.toFixed(4)}
                    </strong>{' '}
                    / {softCapNum > 0 ? `${softCapNum} BNB` : '--'}
                    <span
                      className={cn(
                        'ml-1.5 font-semibold',
                        isSoftCapReached ? 'text-green-400' : 'text-[#FFA546]',
                      )}
                    >
                      ({softCapPercent}%)
                    </span>
                  </span>
                </div>
                <Progress
                  value={softCapPercent}
                  className="h-1.5 w-full bg-[#111213]"
                />
              </div>

              {/* 进度条 3：硬顶募资进度（若配置了硬顶） */}
              {hardCapNum > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-neutral-400">
                      <span className="size-1.5 bg-neutral-400" />
                      募资硬顶总进度 (Hard Cap)
                    </span>
                    <span className="font-mono text-neutral-300">
                      <strong className="text-white">
                        {bnbAccumulatedNum.toFixed(4)}
                      </strong>{' '}
                      / {hardCapNum} BNB
                      <span className="ml-1.5 font-semibold text-[#FFA546]">
                        ({hardCapPercent}%)
                      </span>
                    </span>
                  </div>
                  <Progress
                    value={hardCapPercent}
                    className="h-1.5 w-full bg-[#111213]"
                  />
                </div>
              )}
            </div>
          )}

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

      {/* 底部操作区：由单一状态机 stage 精准分流渲染 */}
      <CardFooter className="flex items-center justify-end gap-2 border-t border-[#2F3737] bg-[#16181a] p-3">
        {(() => {
          switch (stage) {
            case 'draft':
              return (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    onClick={() => {
                      if (!canEdit.allowed) {
                        toast.error(canEdit.reason || '无法编辑代币资料')
                        return
                      }
                      onEdit(token)
                    }}
                    disabled={!canEdit.allowed}
                  >
                    <Edit3 />
                    <span>编辑代币信息</span>
                  </Button>
                  <Button
                    type="button"
                    size="default"
                    onClick={() => {
                      if (!canIssue.allowed) {
                        toast.error(canIssue.reason || '无法发行代币')
                        return
                      }
                      onLaunch(token)
                    }}
                    disabled={!canIssue.allowed}
                    className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5 disabled:opacity-50"
                  >
                    <Rocket />
                    <span>我要发行</span>
                  </Button>
                </>
              )

            case 'syncing':
              return (
                <Button
                  type="button"
                  variant="secondary"
                  size="default"
                  disabled
                  className="opacity-50"
                >
                  <Loader2 className="animate-spin" />
                  <span>同步链上状态…</span>
                </Button>
              )

            case 'claim_or_setup':
              return (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    onClick={handleClaimTokens}
                    disabled={isClaiming}
                  >
                    {isClaiming ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Gift />
                    )}
                    <span>{isClaiming ? '领取中…' : '领取代币'}</span>
                  </Button>
                  <Button
                    type="button"
                    size="default"
                    onClick={handlePresaleClick}
                    className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5"
                  >
                    <Rocket />
                    <span>设置预售</span>
                  </Button>
                </>
              )

            case 'open_presale':
              return (
                <Button
                  type="button"
                  size="default"
                  onClick={() => onOpenPresale(token)}
                  className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5"
                >
                  <Rocket />
                  <span>开启预售</span>
                </Button>
              )

            case 'presale_live':
              return (
                <Button
                  type="button"
                  variant="secondary"
                  size="default"
                  disabled
                  className="opacity-75"
                >
                  <Clock className="size-4 text-[#FFA546]" />
                  <span>预售认购中 (未达软顶)</span>
                </Button>
              )

            case 'end_presale':
              return (
                <Button
                  type="button"
                  size="default"
                  onClick={handleEndPresale}
                  disabled={isEnding}
                  className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5 disabled:opacity-50"
                >
                  {isEnding ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Rocket />
                  )}
                  <span>{isEnding ? '结束中…' : '结束预售'}</span>
                </Button>
              )

            case 'launch':
              return (
                <Button
                  type="button"
                  size="default"
                  onClick={handleLaunchPool}
                  disabled={isLaunching}
                  className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5 disabled:opacity-50"
                >
                  {isLaunching ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Rocket />
                  )}
                  <span>
                    {isLaunching ? '开盘加池中…' : '一键开盘上线 (Launch)'}
                  </span>
                </Button>
              )

            case 'failed':
              return (
                <Button
                  type="button"
                  variant="destructive"
                  size="default"
                  disabled
                >
                  <span>预售失败</span>
                </Button>
              )

            case 'terminal':
            default:
              return (
                <Button
                  type="button"
                  variant="secondary"
                  size="default"
                  disabled
                >
                  <span>{tokensClaimed ? '代币已领取' : '已上线交易'}</span>
                </Button>
              )
          }
        })()}
      </CardFooter>
    </Card>
  )
}
