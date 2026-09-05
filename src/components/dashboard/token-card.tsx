import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConfig, useConnection, useReadContract } from 'wagmi'
import { writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { formatEther, type Hex } from 'viem'
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
  AlertTriangle,
} from 'lucide-react'

import type { TokenDetail } from '@/api/token'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Web3ActionButton } from '@/components/common/web3-action-button'
import { toast } from '@/components/ui/toast'
import {
  formatAddress,
  formatTokenSupply,
  formatNumber,
  formatDecimalText,
} from '@/lib/format'
import { PresaleAbi, FlapTaxTokenV3Abi } from '@/contracts/abi'
import { parseContractError } from '@/lib/contract-error'
import { useLocale } from '@/lib/i18n'
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
  end_presale: {
    label: '认购进行中',
    className: 'border-amber-800/40 bg-amber-950/30 text-amber-400',
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
  onEdit: (token: TokenDetail) => void
  onPresale: (token: TokenDetail) => void
  onOpenPresale: (token: TokenDetail) => void
  onLaunch: (token: TokenDetail) => void
  onClaim: (token: TokenDetail) => void
}

export function TokenCard({
  token,
  onEdit,
  onPresale,
  onOpenPresale,
  onLaunch,
  onClaim,
}: TokenCardProps) {
  const { locale } = useLocale()
  const config = useConfig()
  const queryClient = useQueryClient()
  const { address: walletAddress, connector: walletConnector } = useConnection()
  const [copied, setCopied] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [isEndConfirmOpen, setIsEndConfirmOpen] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [isAbandoning, setIsAbandoning] = useState(false)
  const [isReclaimConfirmOpen, setIsReclaimConfirmOpen] = useState(false)
  const [creatorBuyWithdrawn, setCreatorBuyWithdrawn] = useState(false)

  // 统一代币门禁守卫
  const {
    isCreator,
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
    tokenState,
    canEdit,
    canIssue,
    canClaimAll,
    canSetupPresale,
    canEndPresale,
    canLaunch,
    creatorBuyBnb,
  } = useTokenGate({ token })

  const bnbAccumulatedNum = Number(formatEther(bnbAccumulated))
  const tokensSubscribedNum = Number(formatEther(tokensSubscribed))
  // 单钱包限购（BNB 口径 = 代币上限 × 预售价，价格缺失时退回代币数量展示）
  const maxBuyBnbNum =
    Number(token.maxBuyPerWallet) > 0 && Number(token.presaleTokenPrice) > 0
      ? Number(token.maxBuyPerWallet) * Number(token.presaleTokenPrice)
      : 0
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

  // 独立读取当前代币发行总量，避免全局错位广播
  const { data: totalSupplyData } = useReadContract({
    address: tokenAddress ? (tokenAddress as `0x${string}`) : undefined,
    abi: FlapTaxTokenV3Abi,
    functionName: 'totalSupply',
    chainId: DEFAULT_CHAIN_ID,
    query: {
      enabled: Boolean(tokenAddress),
      staleTime: Infinity,
    },
  })
  const totalSupplyText =
    totalSupplyData !== undefined && totalSupplyData !== null
      ? formatTokenSupply(totalSupplyData as bigint, locale)
      : '--'

  // 单一状态机收敛生命周期，替代分散的多重布尔判断
  const stage: TokenCardStage = resolveTokenStage({
    isIssued,
    isChainLoading,
    tokensClaimed,
    tokenState,
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

  const handleClaimTokens = async (_userAddress: Hex) => {
    if (!canClaimAll.allowed) {
      toast.error(canClaimAll.reason || '当前不可领取代币')
      return
    }
    if (!presaleAddress) return

    setIsClaiming(true)
    try {
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
      toast.error(parseContractError(err, '代币领取失败，请稍后重试'), '领取失败')
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
    if (!presaleAddress) {
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
      toast.success(
        isSoftCapReached
          ? '预售已成功结束！已进入待开盘加池阶段'
          : '预售已结束！未达软顶，已转入退款流程（可重开预售）',
      )
    } catch (err: unknown) {
      toast.error(parseContractError(err, '结束预售失败，请稍后重试'), '结束失败')
    } finally {
      setIsEnding(false)
      setIsEndConfirmOpen(false)
    }
  }

  // 预检：连接账户有效性 + 创建者身份（reclaim/relaunch 均仅创建者可调用；
  // 账户不一致或非创建者时，钱包预估交易会直接报「预估失败」）
  const ensureFailedActionAllowed = async (): Promise<boolean> => {
    if (!isCreator) {
      toast.error('仅代币创建者可执行此操作', '权限不足')
      return false
    }
    if (walletConnector && walletAddress) {
      try {
        const accounts = await walletConnector.getAccounts()
        if (
          !accounts.some((a) => a.toLowerCase() === walletAddress.toLowerCase())
        ) {
          toast.error(
            '钱包当前账户与连接账户不一致，请切回该账户或重新连接钱包',
            '账户不一致',
          )
          return false
        }
      } catch {
        // 预检失败不阻断，交由钱包在签名环节给出错误
      }
    }
    return true
  }

  // 预售失败出口：领取代币，放弃本次预售（不可再重开）。
  // 若配置过创建者购买注资，先自动提取注资，成功后接着领取代币（一次点击，顺序两笔交易）
  const handleReclaimTokens = async () => {
    if (!presaleAddress) return
    if (!(await ensureFailedActionAllowed())) return

    setIsAbandoning(true)
    try {
      if (creatorBuyBnb > 0n && !creatorBuyWithdrawn) {
        const withdrawHash = await writeContract(config, {
          address: presaleAddress,
          abi: PresaleAbi,
          functionName: 'withdrawCreatorBuy',
          chainId: DEFAULT_CHAIN_ID,
        })
        await waitForTransactionReceipt(config, {
          hash: withdrawHash,
          chainId: DEFAULT_CHAIN_ID,
        })
        setCreatorBuyWithdrawn(true)
        toast.success(
          `创建者注资已提取！${formatDecimalText(Number(formatEther(creatorBuyBnb)))} BNB 已原路退回`,
        )
      }

      const reclaimHash = await writeContract(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'reclaimTokens',
        chainId: DEFAULT_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, {
        hash: reclaimHash,
        chainId: DEFAULT_CHAIN_ID,
      })
      queryClient.invalidateQueries()
      toast.success('代币已全部领取！本次预售已放弃，可自行添加流动性开盘交易')
    } catch (err: unknown) {
      toast.error(parseContractError(err, '操作失败，请稍后重试'), '操作失败')
    } finally {
      setIsAbandoning(false)
      setIsReclaimConfirmOpen(false)
    }
  }

  const handleLaunchPool = async () => {
    if (!canLaunch.allowed) {
      toast.error('当前状态不可开盘加池')
      return
    }
    if (!presaleAddress) return

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
      toast.error(parseContractError(err, '一键开盘失败，请稍后重试'), '开盘失败')
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
              <div className="flex flex-col divide-y divide-white/5 border-b border-white/5 pb-1 text-xs">
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-neutral-400">预售价</span>
                  <span className="font-mono font-medium text-white">
                    {token.presaleTokenPrice
                      ? `${formatDecimalText(token.presaleTokenPrice)} BNB`
                      : '--'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5">
                  <span className="text-neutral-400">单钱包限购</span>
                  <span className="font-mono font-medium text-white">
                    {maxBuyBnbNum > 0
                      ? `${formatDecimalText(maxBuyBnbNum)} BNB`
                      : token.maxBuyPerWallet
                        ? `${formatNumber(token.maxBuyPerWallet)} 枚`
                        : '--'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5">
                  <span className="text-neutral-400">已募 BNB</span>
                  <span className="font-mono font-semibold text-[#FFA546]">
                    {formatDecimalText(bnbAccumulatedNum)} BNB
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
                <div className="flex items-center justify-between text-xs">
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
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-neutral-400">
                    <span className="size-1.5 bg-[#FFA546]" />
                    预售软顶达标线 (Soft Cap)
                  </span>
                  <span className="font-mono text-neutral-300">
                    <strong className="text-white">
                      {formatDecimalText(bnbAccumulatedNum)}
                    </strong>{' '}
                    / {softCapNum > 0 ? `${formatDecimalText(softCapNum)} BNB` : '--'}
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
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-neutral-400">
                      <span className="size-1.5 bg-neutral-400" />
                      募资硬顶总进度 (Hard Cap)
                    </span>
                    <span className="font-mono text-neutral-300">
                      <strong className="text-white">
                        {formatDecimalText(bnbAccumulatedNum)}
                      </strong>{' '}
                      / {formatDecimalText(hardCapNum)} BNB
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
                    className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white transition-transform active:translate-y-0.5 disabled:opacity-50"
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
                  <Web3ActionButton
                    type="button"
                    variant="outline"
                    size="default"
                    onAction={handleClaimTokens}
                    loading={isClaiming}
                    loadingText="领取中…"
                  >
                    <Gift />
                    <span>领取代币</span>
                  </Web3ActionButton>
                  <Button
                    type="button"
                    size="default"
                    onClick={handlePresaleClick}
                    className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white transition-transform active:translate-y-0.5"
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
                  className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white transition-transform active:translate-y-0.5"
                >
                  <Rocket />
                  <span>开启预售</span>
                </Button>
              )

            case 'end_presale':
              return (
                <Button
                  type="button"
                  size="default"
                  onClick={() => {
                    if (!canEndPresale.allowed) {
                      toast.error(canEndPresale.reason || '当前不可结束预售')
                      return
                    }
                    setIsEndConfirmOpen(true)
                  }}
                  className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white transition-transform active:translate-y-0.5"
                >
                  <Rocket />
                  <span>结束预售</span>
                </Button>
              )

            case 'launch':
              return (
                <Web3ActionButton
                  type="button"
                  size="default"
                  onAction={handleLaunchPool}
                  loading={isLaunching}
                  loadingText="开盘加池中…"
                  className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white transition-transform active:translate-y-0.5 disabled:opacity-50"
                >
                  <Rocket />
                  <span>一键开盘上线 (Launch)</span>
                </Web3ActionButton>
              )

            case 'failed':
              return (
                <div className="flex w-full flex-col gap-2.5">
                  <div className="flex items-start gap-2 rounded border border-red-500/25 bg-red-500/10 p-2.5">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-400" />
                    <div className="flex flex-col gap-0.5 text-left">
                      <span className="text-xs font-bold text-red-400">
                        预售失败
                      </span>
                      <span className="text-xs leading-relaxed text-neutral-400">
                        本次认购未达到软顶要求或超时未完成开盘，预售已终止，代币暂未上线，本轮认购者可申请退款。领取代币即放弃本次预售。
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    onClick={() => setIsReclaimConfirmOpen(true)}
                    disabled={isAbandoning}
                    className="rounded border-[#484b51] bg-[#1a1c1e] text-xs font-semibold text-neutral-200 hover:bg-white/10"
                  >
                    <Gift className="size-4" />
                    <span>领取代币 (放弃预售)</span>
                  </Button>
                </div>
              )

            case 'terminal':
            default:
              return (
                <div className="flex w-full flex-col gap-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="default"
                    disabled
                  >
                    <span>{tokensClaimed ? '代币已领取' : '已上线交易'}</span>
                  </Button>
                </div>
              )
          }
        })()}
      </CardFooter>

      {/* 结束预售确认弹窗 */}
      <Dialog
        open={isEndConfirmOpen}
        onOpenChange={(open) => !open && setIsEndConfirmOpen(false)}
      >
        <DialogContent className="max-w-md border border-[#484b51] bg-[#131516] p-0 text-white">
          <DialogHeader className="px-5 pt-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-400" />
              <DialogTitle className="text-base font-bold text-white">
                确认结束预售？
              </DialogTitle>
            </div>
            <DialogDescription className="mt-1.5 text-xs leading-relaxed text-neutral-400">
              {isSoftCapReached
                ? '本次认购已达到软顶。提前结束将立即终止认购：募集资金锁定在托管仓，之后可在 72 小时内一键加池开盘上线。'
                : '本次认购未达到软顶。提前结束将立即终止认购：全部认购资金进入退款流程，用户按原路领取退款，认购份额作废；之后你可以重开新一轮预售。'}
            </DialogDescription>
          </DialogHeader>

          <div className="px-5">
            <div
              className={cn(
                'flex items-start gap-2 rounded-md border p-3 text-xs',
                isSoftCapReached
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/20 bg-amber-500/10 text-amber-300',
              )}
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {isSoftCapReached
                  ? '注意：开盘窗口为结束后 72 小时，超时未加池，任何人可触发预售转为失败。'
                  : '注意：结束不可撤销。未达软顶无法开盘上线代币，认购者只能退款。'}
              </span>
            </div>
          </div>

          <DialogFooter className="flex flex-row items-center justify-end gap-2 px-5 pb-5 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isEnding}
              onClick={() => setIsEndConfirmOpen(false)}
              className="rounded border-[#484b51] bg-[#1a1c1e] text-xs text-neutral-300 hover:bg-[#25282c]"
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isEnding}
              onClick={handleEndPresale}
              className="flex items-center gap-1.5 rounded border border-white/40 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white transition-transform active:translate-y-0.5 disabled:opacity-50"
            >
              {isEnding ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>结束中…</span>
                </>
              ) : (
                <span>确认结束</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 领取代币（放弃预售）确认弹窗 */}
      <Dialog
        open={isReclaimConfirmOpen}
        onOpenChange={(open) => !open && setIsReclaimConfirmOpen(false)}
      >
        <DialogContent className="max-w-md border border-[#484b51] bg-[#131516] p-0 text-white">
          <DialogHeader className="px-5 pt-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-400" />
              <DialogTitle className="text-base font-bold text-white">
                领取代币（放弃预售）？
              </DialogTitle>
            </div>
            <DialogDescription className="mt-1.5 text-xs leading-relaxed text-neutral-400">
              将把托管仓内的全部代币领取到你的钱包，本次预售永久放弃（不可再重开）。领取后代币即上线，可自行添加流动性交易。
              {creatorBuyBnb > 0n && !creatorBuyWithdrawn &&
                ' 确认后将自动提取创建者注资，再领取代币（共两笔交易）。'}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>注意：放弃后不可撤销，本轮认购者仍可按原路申请退款。</span>
            </div>
          </div>
          <DialogFooter className="flex flex-row items-center justify-end gap-2 px-5 pb-5 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isAbandoning}
              onClick={() => setIsReclaimConfirmOpen(false)}
              className="rounded border-[#484b51] bg-[#1a1c1e] text-xs text-neutral-300 hover:bg-[#25282c]"
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isAbandoning}
              onClick={handleReclaimTokens}
              className="flex items-center gap-1.5 rounded border border-white/40 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5 disabled:opacity-50"
            >
              {isAbandoning ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>处理中…</span>
                </>
              ) : (
                <span>确认领取</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
