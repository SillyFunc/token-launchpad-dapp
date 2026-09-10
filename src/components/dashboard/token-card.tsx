import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConfig, useConnection, useReadContract } from 'wagmi'
import { readContract } from '@wagmi/core'
import { useNavigate } from 'react-router'
import { formatEther, isAddress, zeroAddress, type Hex } from 'viem'
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

import { parseTxHash, type TokenDetail } from '@/api/token'
import { requestAuthSignature } from '@/api/auth'
import { useCreateToken } from '@/hooks/use-coordinator'
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
import {
  CoordinatorFactoryAbi,
  PresaleAbi,
  FlapTaxTokenV3Abi,
} from '@/contracts/abi'
import { parseContractError } from '@/lib/contract-error'
import { sendContractTx } from '@/lib/contract-tx'
import { useLocale } from '@/lib/i18n'
import {
  useTokenGate,
  resolveTokenStage,
  type TokenCardStage,
} from '@/hooks/use-token-gate'
import {
  DEFAULT_CHAIN_ID,
  getContractAddresses,
  getExplorerUrl,
} from '@/config/network'
import { predictTokenAddress } from '@/lib/vanity-salt'
import { watchErc20Asset } from '@/lib/wallet-watch-asset'
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
  /** 进入预售配置，地址来自链上查询或发行交易回执，不依赖后端解析 */
  onPresale: (token: TokenDetail, tokenAddress: Hex) => void
  /** 预售已在链上开启 */
  onPresaleOpened: (token: TokenDetail) => void
  /** 代币已上链，回传部署出的代币地址 */
  onIssued: (token: TokenDetail, tokenAddress: Hex) => void
  onClaim: (token: TokenDetail) => void
}

export function TokenCard({
  token,
  onEdit,
  onPresale,
  onPresaleOpened,
  onIssued,
  onClaim,
}: TokenCardProps) {
  const { locale } = useLocale()
  const navigate = useNavigate()
  const config = useConfig()
  const queryClient = useQueryClient()
  const { execute: createToken } = useCreateToken()
  const [copied, setCopied] = useState(false)
  // 发行交易回执中的 TokenPresalePairCreated.token 是刚部署地址的即时权威来源
  const [issuedAddress, setIssuedAddress] = useState<Hex | null>(null)
  const [isIssuing, setIsIssuing] = useState(false)
  const [isOpeningPresale, setIsOpeningPresale] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [isEndConfirmOpen, setIsEndConfirmOpen] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [isRelaunching, setIsRelaunching] = useState(false)

  const { address: userAddress } = useConnection()
  const coordinatorAddress =
    getContractAddresses(DEFAULT_CHAIN_ID).coordinatorFactory
  const creatorWallet = (token.creatorAddress ||
    token.address ||
    userAddress) as Hex | undefined

  // 1. 从合约 CoordinatorFactory.getTokenPresalePairsByCreator 获取该创建者在链上的真实代币
  const { data: creatorPairsData } = useReadContract({
    address: coordinatorAddress,
    abi: CoordinatorFactoryAbi,
    functionName: 'getTokenPresalePairsByCreator',
    args:
      creatorWallet && isAddress(creatorWallet)
        ? [creatorWallet, 0n, 50n]
        : undefined,
    chainId: DEFAULT_CHAIN_ID,
    query: {
      enabled: Boolean(creatorWallet && isAddress(creatorWallet)),
      staleTime: 10_000,
    },
  })

  // 2. 权威代币合约地址：优先使用当前发行交易回执，其次从 Coordinator 链上列表核验。
  // 后端 coinContractAddress 只兼容已同步的历史记录，不参与刚发行后的即时链路。
  const tokenAddress = useMemo(() => {
    if (issuedAddress) return issuedAddress

    // salt 可在本地确定性推导 CREATE2 地址，是否已发行再由 useTokenGate.tokenExists 链上确认
    if (token.salt) {
      try {
        return predictTokenAddress(token.salt as Hex)
      } catch {
        void 0
      }
    }

    // 兼容没有 salt 的历史草稿：只在 Coordinator 链上创建列表中按名称和符号匹配
    if (Array.isArray(creatorPairsData) && token.name && token.symbol) {
      const match = creatorPairsData.find(
        (pair) =>
          pair.tokenSymbol.trim().toLowerCase() ===
            token.symbol.trim().toLowerCase() &&
          pair.tokenName.trim().toLowerCase() ===
            token.name.trim().toLowerCase(),
      )
      if (match) return match.tokenAddress as Hex
    }

    return ''
  }, [issuedAddress, creatorPairsData, token.salt, token.symbol, token.name])

  // 统一代币门禁守卫（注入从合约解析出的权威 tokenAddress）
  const {
    isIssued,
    isChainLoading,
    presaleAddress,
    presaleConfigured,
    presaleEnabled,
    presaleStatus,
    presaleRound,
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
    isCreator,
  } = useTokenGate({
    token,
    tokenAddress: tokenAddress || undefined,
    // 发行回执到达后绕过发行前 tokenExists=false 的缓存，直接重读 Coordinator
    fresh: Boolean(issuedAddress),
  })

  const bnbAccumulatedNum = Number(formatEther(bnbAccumulated))
  const tokensSubscribedNum = Number(formatEther(tokensSubscribed))
  // 单钱包限购（BNB 口径 = 代币上限 × 预售价，价格缺失时退回代币数量展示）
  const maxBuyBnbNum =
    Number(token.maxBuyPerWallet) > 0 && Number(token.presaleTokenPrice) > 0
      ? Number(token.maxBuyPerWallet) * Number(token.presaleTokenPrice)
      : 0
  const presaleShareNum =
    presaleShare > 0n ? Number(formatEther(presaleShare)) : 500_000

  const tokenSalesPercent =
    presaleShareNum > 0
      ? Math.min(100, Math.round((tokensSubscribedNum / presaleShareNum) * 100))
      : 0

  const softCapNum =
    softCap > 0n
      ? Number(formatEther(softCap))
      : Number(token.softcap || token.soft || 0)
  const hardCapNum =
    hardCap > 0n ? Number(formatEther(hardCap)) : Number(token.hardcap || 0)

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
      await sendContractTx(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'claimAllTokens',
        account: userAddress,
        chainId: DEFAULT_CHAIN_ID,
      })
      queryClient.invalidateQueries()
      toast.success('请关注您钱包里的代币余额', '领取成功')
      onClaim(token)
    } catch (err: unknown) {
      toast.error(
        parseContractError(err, '代币领取失败，请稍后重试'),
        '领取失败',
      )
    } finally {
      setIsClaiming(false)
    }
  }

  const handlePresaleClick = () => {
    if (!tokenAddress) {
      toast.warning('正在同步链上代币地址，请稍后重试')
      return
    }
    if (!canSetupPresale.allowed && canSetupPresale.reason) {
      toast.warning(canSetupPresale.reason)
    }
    onPresale(token, tokenAddress)
  }

  const handleOpenPresale = async (account: Hex) => {
    setIsOpeningPresale(true)
    try {
      const coordinator =
        getContractAddresses(DEFAULT_CHAIN_ID).coordinatorFactory

      // 优先使用 gate 解析结果，列表读取时序未完成时直读 Coordinator 兜底
      let escrow = presaleAddress
      if (!escrow && tokenAddress && isAddress(tokenAddress)) {
        const onChainEscrow = (await readContract(config, {
          address: coordinator,
          abi: CoordinatorFactoryAbi,
          functionName: 'tokenPresales',
          args: [tokenAddress],
          chainId: DEFAULT_CHAIN_ID,
        })) as string
        if (isAddress(onChainEscrow) && onChainEscrow !== zeroAddress) {
          escrow = onChainEscrow.toLowerCase() as Hex
        }
      }

      if (!escrow) {
        toast.error(
          '未在链上找到该代币的托管仓，请确认代币已在链上发行',
          '开启失败',
        )
        return
      }

      let isConfiguredOnChain = presaleConfigured
      try {
        isConfiguredOnChain = (await readContract(config, {
          address: coordinator,
          abi: CoordinatorFactoryAbi,
          functionName: 'tokenConfigured',
          args: [tokenAddress as Hex],
          chainId: DEFAULT_CHAIN_ID,
        })) as boolean
      } catch (readErr) {
        console.warn('Read tokenConfigured failed:', readErr)
      }

      if (!isConfiguredOnChain) {
        toast.warning('请先配置预售条款后再开启预售')
        onPresale(token, tokenAddress as Hex)
        return
      }

      await sendContractTx(config, {
        address: escrow,
        abi: PresaleAbi,
        functionName: 'openPresale',
        account,
        chainId: DEFAULT_CHAIN_ID,
        gas: 150_000n,
      })

      await queryClient.invalidateQueries()
      toast.success('预售已成功开启！现已开放散户认购')
      onPresaleOpened(token)
    } catch (err: unknown) {
      toast.error(parseContractError(err), '开启失败')
    } finally {
      setIsOpeningPresale(false)
    }
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
      await sendContractTx(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'endPresale',
        account: userAddress,
        chainId: DEFAULT_CHAIN_ID,
      })
      queryClient.invalidateQueries()
      toast.success(
        isSoftCapReached
          ? '预售已成功结束！已进入待开盘加池阶段'
          : '预售已结束！未达软顶，已转入退款流程（可重开预售）',
      )
    } catch (err: unknown) {
      toast.error(
        parseContractError(err, '结束预售失败，请稍后重试'),
        '结束失败',
      )
    } finally {
      setIsEnding(false)
      setIsEndConfirmOpen(false)
    }
  }

  // 草稿上链：草稿保存的盐决定代币地址（预留地址需用锁定时的原盐通过 NotReserver 校验），
  // 无盐时由 useCreateToken 现场搜盐
  const handleIssueToken = async (account: Hex) => {
    if (!canIssue.allowed) {
      toast.error(canIssue.reason || '当前代币不可发行')
      return
    }

    setIsIssuing(true)
    try {
      const auth = await requestAuthSignature(config, account)
      const result = await createToken({
        name: token.name,
        symbol: token.symbol,
        meta: token.meta || token.zhIntroduction || '',
        buyTax: token.buyTax ?? 0,
        sellTax: token.sellTax ?? 0,
        feeRecipient: (token.feeRecipient as Hex) || zeroAddress,
        taxDurationDays: Number(token.taxDuration) || 30,
        antiFarmerDurationDays: Number(token.antiFarmerDuration) || 0,
        salt: token.salt ? (token.salt as Hex) : undefined,
      })

      // 交易回执事件已给出权威地址，立即更新 UI；后端解析异步进行，不阻塞预售入口
      setIssuedAddress(result.tokenAddress)
      toast.success('代币发行成功！')
      onIssued(token, result.tokenAddress)

      // 发行确认后请求当前注入钱包添加该 ERC-20；钱包不支持、用户跳过或 Logo 无效
      // 都不能影响已经成功上链的发行流程。
      void watchErc20Asset({
        address: result.tokenAddress,
        symbol: token.symbol,
        decimals: 18,
        image: token.coinImg,
      }).catch((error) =>
        console.debug('Wallet did not add the issued token asset', error),
      )

      if (token.id) {
        void parseTxHash({ id: token.id, hash: result.txHash, ...auth }).catch(
          (error) => console.error('Failed to sync tx hash to backend', error),
        )
      }
    } catch (err: unknown) {
      toast.error(parseContractError(err, '发行失败，请稍后重试'), '发行失败')
    } finally {
      setIsIssuing(false)
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
      await sendContractTx(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'launch',
        account: userAddress,
        chainId: DEFAULT_CHAIN_ID,
      })
      queryClient.invalidateQueries()
      toast.success('代币已成功开盘加池！LP 已永久死锁')
    } catch (err: unknown) {
      toast.error(
        parseContractError(err, '一键开盘失败，请稍后重试'),
        '开盘失败',
      )
    } finally {
      setIsLaunching(false)
    }
  }

  const handleRelaunchPresale = async (account: Hex) => {
    if (!presaleAddress) {
      toast.error('未找到预售托管仓地址')
      return
    }
    if (bnbAccumulated > 0n) {
      toast.warning('等待全部认购者退款后才能重开预售')
      return
    }
    if (!isCreator) {
      toast.error('当前连接的钱包不是该代币的创建者，无法重开预售')
      return
    }

    setIsRelaunching(true)
    try {
      await sendContractTx(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'relaunchPresale',
        account,
        chainId: DEFAULT_CHAIN_ID,
        // 合约实测约 24k，留足余量以绕过钱包节点偶发的错误估算。
        gas: 80_000n,
      })
      queryClient.invalidateQueries()
      toast.success('预售状态已成功重置！正在前往重开预售界面配置条款…')
      navigate(`/represale?id=${token.id}&address=${tokenAddress}`)
    } catch (err: unknown) {
      toast.error(
        parseContractError(err, '重置预售状态失败，请稍后重试'),
        '重开失败',
      )
    } finally {
      setIsRelaunching(false)
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
                  tokenAddress
                    ? 'font-semibold text-white'
                    : 'font-normal text-neutral-400'
                }
              >
                {tokenAddress ? totalSupplyText : '暂未发行'}
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
                    /{' '}
                    {softCapNum > 0
                      ? `${formatDecimalText(softCapNum)} BNB`
                      : '--'}
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

      {/* 底部操作区：由单一状态机 stage 精准分流渲染，按钮纵向通栏、一行一个 */}
      <CardFooter className="flex w-full flex-col items-stretch gap-2 border-t border-[#2F3737] bg-[#16181a] p-3">
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
                  <Web3ActionButton
                    type="button"
                    size="default"
                    onAction={handleIssueToken}
                    disabled={!canIssue.allowed}
                    loading={isIssuing}
                    loadingText="发行中…"
                    className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white transition-transform active:translate-y-0.5 disabled:opacity-50"
                  >
                    <Rocket />
                    <span>我要发行</span>
                  </Web3ActionButton>
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
                <>
                  {presaleRound > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      onClick={() => {
                        navigate(
                          `/represale?id=${token.id}&address=${tokenAddress}`,
                        )
                      }}
                      className="rounded border-[#484b51] bg-[#1a1c1e] text-xs font-semibold text-neutral-200 hover:bg-white/10 cursor-pointer"
                    >
                      <Edit3 className="size-4 mr-1" />
                      <span>配置预售条款</span>
                    </Button>
                  )}
                  <Web3ActionButton
                    type="button"
                    size="default"
                    onAction={handleOpenPresale}
                    loading={isOpeningPresale}
                    loadingText="开启中…"
                    className="cursor-pointer border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white transition-transform active:translate-y-0.5"
                  >
                    <Rocket className="size-4 mr-1" />
                    <span>开启预售</span>
                  </Web3ActionButton>
                </>
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
                        本次认购未达到软顶要求或超时未完成开盘，预售已终止。本轮认购者可随时申请退款；全部退款完成后即可重开新一轮预售。
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400">未退款金额：</span>
                    <span className="font-mono font-medium text-[#FFA546]">
                      {formatDecimalText(Number(formatEther(bnbAccumulated)))}{' '}
                      BNB
                    </span>
                  </div>
                  <Web3ActionButton
                    type="button"
                    size="default"
                    onAction={handleRelaunchPresale}
                    disabled={bnbAccumulated > 0n || isRelaunching}
                    loading={isRelaunching}
                    loadingText="正在重置预售状态…"
                    title={
                      bnbAccumulated > 0n ? '等待全部认购者退款' : undefined
                    }
                    className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white transition-transform active:translate-y-0.5 disabled:opacity-40 cursor-pointer"
                  >
                    <Rocket className="size-4 mr-1.5" />
                    <span>重开预售</span>
                  </Web3ActionButton>
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
    </Card>
  )
}
