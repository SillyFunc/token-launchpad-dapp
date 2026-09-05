import { useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConnection, useConfig, useReadContract, useBalance } from 'wagmi'
import {
  writeContract,
  waitForTransactionReceipt,
} from '@wagmi/core'
import {
  parseEther,
  formatEther,
  formatUnits,
  isAddress,
  type Hex,
} from 'viem'
import {
  Coins,
  Copy,
  Check,
  ExternalLink,
  Globe,
  Send,
  Gift,
  AlertTriangle,
  TrendingUp,
  Loader2,
  XCircle,
  Clock,
} from 'lucide-react'

import { getTokenByContractAddress } from '@/api/token'
import { Button } from '@/components/ui/button'
import { Web3ActionButton } from '@/components/common/web3-action-button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import {
  formatAddress,
  formatNumber,
  formatDecimalText,
  formatTokenSupply,
} from '@/lib/format'
import { useLocale } from '@/lib/i18n'
import { useTokenGate } from '@/hooks/use-token-gate'
import { useTokenPrice } from '@/hooks/use-token-price'
import {
  DEFAULT_CHAIN_ID,
  getExplorerUrl,
} from '@/config/network'
import titleBackArrow from '@/assets/icons/back-arrow.svg'
import { PresaleAbi, FlapTaxTokenV3Abi } from '@/contracts/abi'
import { parseContractError } from '@/lib/contract-error'
import { cn } from '@/lib/utils'

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

export function TokenDetailPage() {
  const { address: routeAddress } = useParams<{ address?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const config = useConfig()

  const rawAddress = routeAddress || searchParams.get('address') || ''
  const tokenAddress =
    Boolean(rawAddress) && isAddress(rawAddress)
      ? (rawAddress.toLowerCase() as Hex)
      : undefined

  const { address: userAddress, connector: walletConnector } = useConnection()

  const [activeTab, setActiveTab] = useState<'presale' | 'vesting' | 'chart'>(
    'presale',
  )
  const [copied, setCopied] = useState(false)

  // 认购输入金额 (BNB)
  const [subscribeAmount, setSubscribeAmount] = useState<string>('')
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [isRefunding, setIsRefunding] = useState(false)
  const [isClaimingVesting, setIsClaimingVesting] = useState(false)

  // ① 后端代币详情
  const {
    data: token,
    isLoading: isTokenLoading,
    isError: isTokenError,
  } = useQuery({
    queryKey: ['tokenDetail', tokenAddress],
    queryFn: () => getTokenByContractAddress(tokenAddress!),
    enabled: Boolean(tokenAddress),
  })

  // ② 代币门禁与链上状态 (WebSocket 实时推送)
  const {
    isChainLoading,
    isIssued,
    presaleAddress,
    presaleEnabled,
    presaleStatus,
    bnbAccumulated,
    tokensSubscribed,
    presaleShare,
    softCap,
    hardCap,
    isSoftCapReached,
    vestingDelay,
    vestingRate,
    onchainPresalePrice,
    onchainMaxBuy,
    presaleEndTime,
  } = useTokenGate({
    tokenAddress,
    token,
    watch: true,
  })

  // ③ 用户钱包 BNB 余额
  const { data: balanceData } = useBalance({
    address: userAddress,
    chainId: DEFAULT_CHAIN_ID,
    query: {
      enabled: Boolean(userAddress),
      staleTime: 10_000,
    },
  })
  const userBnbBalance = balanceData
    ? Number(formatUnits(balanceData.value, balanceData.decimals))
    : 0

  // ④ 代币链上总供应量
  const { data: totalSupplyData } = useReadContract({
    address: tokenAddress,
    abi: FlapTaxTokenV3Abi,
    functionName: 'totalSupply',
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: isIssued, staleTime: Infinity },
  })
  const totalSupply = (totalSupplyData as bigint | undefined) ?? 0n

  // ⑤ 用户个人的 Vesting 认购与解锁状态
  const { data: userVestingData, refetch: refetchVesting } = useReadContract({
    address: presaleAddress,
    abi: PresaleAbi,
    functionName: 'getUserVestingStatus',
    args: userAddress ? [userAddress] : undefined,
    chainId: DEFAULT_CHAIN_ID,
    query: {
      enabled: Boolean(presaleAddress && userAddress),
      staleTime: 5_000,
    },
  })
  // (share, claimable, claimed, nextVestingTime)
  const [userShare = 0n, userClaimable = 0n, userClaimed = 0n, nextVestingTime = 0n] =
    (userVestingData as
      | readonly [bigint, bigint, bigint, bigint]
      | undefined) ?? []

  // 用户认购支付记录（预售失败退款用）
  const {
    data: userContributionData,
    refetch: refetchContribution,
  } = useReadContract({
    address: presaleAddress,
    abi: PresaleAbi,
    functionName: 'contributions',
    args: userAddress ? [userAddress] : undefined,
    chainId: DEFAULT_CHAIN_ID,
    query: {
      enabled: Boolean(presaleAddress && userAddress),
      staleTime: 5_000,
    },
  })
  const userContribution = (userContributionData as bigint | undefined) ?? 0n

  // ⑥ 价格行情数据 (WebSocket 实时订阅)
  const tokenPriceData = useTokenPrice(
    tokenAddress || '',
    totalSupply,
    0,
  )

  const handleCopy = () => {
    if (!tokenAddress) return
    void navigator.clipboard.writeText(tokenAddress)
    setCopied(true)
    toast.success('代币合约地址已复制')
    setTimeout(() => setCopied(false), 2000)
  }

  // 计算与格式化衍生数据（链上权威数据优先，后端数据兜底）
  const { locale } = useLocale()
  const presalePriceNum =
    onchainPresalePrice > 0n
      ? Number(formatEther(onchainPresalePrice))
      : Number(token?.presaleTokenPrice || 0)
  const maxBuyNum =
    onchainMaxBuy > 0n
      ? Number(formatEther(onchainMaxBuy))
      : Number(token?.maxBuyPerWallet || 0)
  const bnbAccumulatedNum = Number(formatEther(bnbAccumulated))
  const tokensSubscribedNum = Number(formatEther(tokensSubscribed))
  const presaleShareNum =
    presaleShare > 0n
      ? Number(formatEther(presaleShare))
      : totalSupply > 0n
        ? Number(formatEther(totalSupply / 2n))
        : 500_000
  // 展示用份额 bigint（链上优先，后端/总量兜底）
  const presaleShareDisplay =
    presaleShare > 0n
      ? presaleShare
      : totalSupply > 0n
        ? totalSupply / 2n
        : 500000n

  const softCapNum =
    softCap > 0n
      ? Number(formatEther(softCap))
      : Number(token?.softcap || token?.soft || 0)
  const hardCapNum =
    hardCap > 0n ? Number(formatEther(hardCap)) : Number(token?.hardcap || 0)

  // 单钱包认购上限（BNB 口径 = 代币上限 × 预售价）
  const maxBuyBnbNum =
    maxBuyNum > 0 && presalePriceNum > 0 ? maxBuyNum * presalePriceNum : 0

  // 进度百分比计算
  const tokenSalesPercent =
    presaleShareNum > 0
      ? Math.min(100, Math.round((tokensSubscribedNum / presaleShareNum) * 100))
      : 0

  const softCapPercent =
    softCapNum > 0
      ? Math.min(100, Math.round((bnbAccumulatedNum / softCapNum) * 100))
      : 0

  const hardCapPercent =
    hardCapNum > 0
      ? Math.min(100, Math.round((bnbAccumulatedNum / hardCapNum) * 100))
      : 0

  // 散户输入 BNB 后预计可得代币量 (公式: msg.value * 1e18 / presaleTokenPrice)
  const inputBnbNum = Number(subscribeAmount) || 0
  const estimatedTokens =
    inputBnbNum > 0 && presalePriceNum > 0
      ? (inputBnbNum / presalePriceNum).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })
      : '0'

  // 单钱包限额换算与剩余额度（考虑累计认购与硬顶剩余）
  const userPurchasedTokens = Number(formatEther(userShare))
  const remainingTokensQuota =
    maxBuyNum > 0 ? Math.max(0, maxBuyNum - userPurchasedTokens) : 0
  const remainingMaxBnbQuota =
    maxBuyNum > 0 && presalePriceNum > 0
      ? Number((remainingTokensQuota * presalePriceNum).toFixed(4))
      : null

  // 剩余未募集硬顶（BNB）
  const remainingHardcapBnb =
    hardCapNum > 0 ? Math.max(0, hardCapNum - bnbAccumulatedNum) : null

  // 综合可用出资上限（钱包可用、单钱包限额剩余、硬顶剩余三者取小）
  const usableWalletBnb = Math.max(0, userBnbBalance - 0.005)
  const ceilingCandidateList = [
    usableWalletBnb,
    remainingMaxBnbQuota,
    remainingHardcapBnb,
  ].filter((v): v is number => v !== null)
  const effectiveMaxBnb =
    ceilingCandidateList.length > 0
      ? Math.min(...ceilingCandidateList)
      : usableWalletBnb

  // 实时超限状态
  const isOverWalletLimit =
    inputBnbNum > 0 &&
    remainingMaxBnbQuota !== null &&
    inputBnbNum > remainingMaxBnbQuota + 0.0001

  // 认购窗口已过但链上仍是认购中（status 1）：任何人可触发 endPresale
  const isPresaleWindowOver =
    presaleStatus === 1 &&
    presaleEndTime !== undefined &&
    Date.now() / 1000 >= Number(presaleEndTime)

  // 快捷百分比填入（基于综合可用上限，去除末尾冗余的 0）
  const handlePercentClick = (percent: number) => {
    const target = (effectiveMaxBnb * percent) / 100
    setSubscribeAmount(target > 0 ? String(parseFloat(target.toFixed(4))) : '')
  }

  // ⑦ 散户参与预售认购
  const handleSubscribe = async () => {
    if (!presaleAddress) {
      toast.error('未找到该代币的预售托管仓')
      return
    }

    if (presaleStatus !== 1) {
      toast.error('预售当前未在认购中')
      return
    }

    if (inputBnbNum <= 0) {
      toast.error('请输入大于 0 的认购金额')
      return
    }

    if (inputBnbNum > userBnbBalance) {
      toast.error('钱包 BNB 余额不足')
      return
    }

    // 校验单钱包限额（累计认购校验，避免分次购买突破限额导致合约 revert）
    if (maxBuyNum > 0 && presalePriceNum > 0) {
      const targetTokens = inputBnbNum / presalePriceNum
      const totalTokensAfter = userPurchasedTokens + targetTokens
      if (totalTokensAfter > maxBuyNum + 0.0001) {
        if (remainingTokensQuota <= 0) {
          toast.error('您已达到单钱包认购上限，无法继续认购')
        } else {
          toast.error(
            `超出单钱包认购上限，您最多还可认购 ${remainingMaxBnbQuota} BNB`,
          )
        }
        return
      }
    }

    // 预检：钱包当前账户与连接账户是否一致。MetaMask 切换过账户或连接过期时，
    // 发交易会报 "Simple Keyring - Unable to find matching address"
    if (walletConnector && userAddress) {
      try {
        const accounts = await walletConnector.getAccounts()
        if (
          !accounts.some((a) => a.toLowerCase() === userAddress.toLowerCase())
        ) {
          toast.error(
            '钱包当前账户与连接账户不一致，请在钱包中切回该账户，或断开后重新连接钱包',
            '认购失败',
          )
          return
        }
      } catch {
        // 预检失败不阻断，交由钱包在签名环节给出错误
      }
    }

    setIsSubscribing(true)
    try {
      const hash = await writeContract(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'subscribe',
        chainId: DEFAULT_CHAIN_ID,
        value: parseEther(subscribeAmount),
      })
      await waitForTransactionReceipt(config, {
        hash,
        chainId: DEFAULT_CHAIN_ID,
      })

      queryClient.invalidateQueries()
      void refetchVesting()
      setSubscribeAmount('')
      toast.success('认购成功！代币份额已锁定在托管仓')
    } catch (err: unknown) {
      toast.error(parseContractError(err, '认购失败，请稍后重试'), '认购失败')
    } finally {
      setIsSubscribing(false)
    }
  }

  // 预售失败退款：按原路退回认购时支付的 BNB
  const handleRefund = async () => {
    if (!presaleAddress) return

    setIsRefunding(true)
    try {
      const hash = await writeContract(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'refund',
        chainId: DEFAULT_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, {
        hash,
        chainId: DEFAULT_CHAIN_ID,
      })

      queryClient.invalidateQueries()
      void refetchVesting()
      void refetchContribution()
      toast.success(
        `退款成功！${formatDecimalText(Number(formatEther(userContribution)))} BNB 已原路退回`,
      )
    } catch (err: unknown) {
      toast.error(
        parseContractError(err, '退款失败，请稍后重试', {
          NothingToClaim: '无可退还的认购资金（可能已退款）',
        }),
        '退款失败',
      )
    } finally {
      setIsRefunding(false)
    }
  }

  // 认购到期后触发结束预售（合约允许任何人调用，无需创建者）
  const [isEndingPresale, setIsEndingPresale] = useState(false)
  const handleTriggerEndPresale = async () => {
    if (!presaleAddress) return

    setIsEndingPresale(true)
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
          ? '预售已结束！软顶已达成，进入待开盘阶段（创建者 72 小时内加池上线）'
          : '预售已结束！未达软顶，已转入退款流程，认购者可申请退款',
      )
    } catch (err: unknown) {
      toast.error(parseContractError(err, '结束失败，请稍后重试'), '结束失败')
    } finally {
      setIsEndingPresale(false)
    }
  }

  // ⑧ 提取解锁代币
  const handleClaimVesting = async () => {
    if (!presaleAddress) return
    if (userClaimable <= 0n) {
      toast.info('当前暂无可领取的代币份额')
      return
    }

    setIsClaimingVesting(true)
    try {
      const hash = await writeContract(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'claim',
        chainId: DEFAULT_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, {
        hash,
        chainId: DEFAULT_CHAIN_ID,
      })

      queryClient.invalidateQueries()
      void refetchVesting()
      toast.success('代币已成功领入钱包！')
    } catch (err: unknown) {
      toast.error(parseContractError(err, '领取失败，请稍后重试'), '领取失败')
    } finally {
      setIsClaimingVesting(false)
    }
  }

  if (!tokenAddress) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center p-12 text-center text-white">
        <AlertTriangle className="size-10 text-amber-400 mb-3" />
        <h2 className="text-base font-bold">无效的代币地址</h2>
        <p className="mt-1 text-xs text-neutral-400">
          请检查 URL 中的代币合约地址参数是否正确。
        </p>
        <Button
          variant="outline"
          size="default"
          onClick={() => navigate('/board')}
          className="mt-4"
        >
          返回行情榜
        </Button>
      </div>
    )
  }

  // 中心化（后端）与去中心化（链上）数据均在加载中 → 全屏 Loading，
  // 避免先渲染默认状态 UI 再跳变
  const isPageLoading =
    !isTokenError &&
    (isTokenLoading || (Boolean(tokenAddress) && isChainLoading))

  if (isPageLoading) {
    return (
      <div
        role="status"
        aria-label="正在加载代币信息"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2.5 bg-background"
      >
        <Spinner className="size-8 text-[#FFA546]" />
        <span className="text-xs text-neutral-300">正在获取代币信息…</span>
      </div>
    )
  }

  // 后端查询失败或未查到代币
  if (isTokenError || !token) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center p-12 text-center text-white">
        <AlertTriangle className="mb-3 size-10 text-amber-400" />
        <h2 className="text-base font-bold">未找到代币信息</h2>
        <p className="mt-1 text-xs text-neutral-400">
          未获取到该代币的中心化或链上数据，请确认地址是否正确。
        </p>
        <Button
          variant="outline"
          size="default"
          onClick={() => navigate('/board')}
          className="mt-4"
        >
          返回行情榜
        </Button>
      </div>
    )
  }

  // 是否开启了预售（严格以链上 presaleEnabled 为准）
  const hasPresale = Boolean(isIssued && presaleEnabled)

  return (
    <div className="relative mx-auto flex w-full flex-col pb-28 pt-4 text-white">
      {/* 顶部返回与标题 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="返回"
            onClick={() => window.history.back()}
            className="flex size-6 shrink-0 items-center justify-center rounded-xs hover:opacity-80 focus:outline-none"
          >
            <img
              src={titleBackArrow}
              alt=""
              aria-hidden="true"
              className="size-full object-cover"
            />
          </button>
          <span className="text-lg font-bold tracking-wide text-white">
            {hasPresale ? '代币预售详情' : '代币详情'}
          </span>
        </div>
      </div>

      {/* 代币概览卡片 (Figma #6501:6158 布局) */}
      <div className="flex flex-col border border-[#2F3737] bg-[#141517] p-4 shadow-lg mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden border border-[#484b51] bg-[#1a1c1e]">
              {token?.coinImg ? (
                <img
                  src={token.coinImg}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <Coins className="size-6 text-[#FFA546]" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-bold text-white">
                  {token?.name || '代币名称'}
                </h1>
                <span className="shrink-0 bg-[#FE810B]/15 px-1.5 py-0.5 text-xs font-semibold text-[#FFA546]">
                  &#36;{token?.symbol || 'TOKEN'}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-neutral-400">
                <span>CA: {formatAddress(tokenAddress)}</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-neutral-400 hover:text-white"
                >
                  {copied ? (
                    <Check className="size-3 text-green-400" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </button>
                <a
                  href={getExplorerUrl(tokenAddress, 'address')}
                  target="_blank"
                  rel="noreferrer"
                  className="text-neutral-400 hover:text-[#FFA546]"
                >
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          </div>

          {/* 社交链接 */}
          <div className="flex items-center gap-2 text-neutral-400">
            {token?.website && (
              <a
                href={token.website}
                target="_blank"
                rel="noreferrer"
                className="p-1 hover:text-[#FFA546]"
                title="官网"
              >
                <Globe className="size-4" />
              </a>
            )}
            {token?.twitter && (
              <a
                href={token.twitter}
                target="_blank"
                rel="noreferrer"
                className="p-1 hover:text-[#FFA546]"
                title="Twitter"
              >
                <TwitterIcon className="size-4" />
              </a>
            )}
            {token?.telegram && (
              <a
                href={token.telegram}
                target="_blank"
                rel="noreferrer"
                className="p-1 hover:text-[#FFA546]"
                title="Telegram"
              >
                <Send className="size-4" />
              </a>
            )}
          </div>
        </div>

        {/* 描述文本 */}
        <p className="mt-3 text-xs leading-relaxed text-neutral-400 line-clamp-2">
          {token?.meta || token?.zhIntroduction || '暂无代币描述'}
        </p>

        {/* 4 栏数据指标 (Figma #6501:6188) */}
        <div className="mt-4 grid grid-cols-4 divide-x divide-white/10 border-t border-white/5 pt-3 text-center text-xs">
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-xs text-neutral-400">代币名称</span>
            <span className="truncate font-medium text-white">
              {token?.name || '--'}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-xs text-neutral-400">代币符号</span>
            <span className="truncate font-medium text-white">
              &#36;{token?.symbol || '--'}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-xs text-neutral-400">总供应量</span>
            <span className="font-mono font-medium text-white">
              {totalSupply > 0n
                ? `${formatNumber(Number(formatEther(totalSupply)), 'zh-TW')}`
                : '--'}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-xs text-neutral-400">买/卖税率</span>
            <span className="font-mono font-medium text-white">
              {token?.buyTax ?? 0}% / {token?.sellTax ?? 0}%
            </span>
          </div>
        </div>
      </div>

      {/* 分流展示：已开启预售代币展示 3 个 Tabs，未开启预售代币直接展示 DEX 行情与交易面板 */}
      {hasPresale ? (
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as typeof activeTab)}
          className="w-full"
        >
          <TabsList
            variant="line"
            className="w-full justify-start border-b border-[#2F3737] bg-transparent p-0 mb-4"
          >
            <TabsTrigger
              value="presale"
              className="flex-1 rounded-none py-2.5 text-xs font-bold text-neutral-400 transition-colors duration-300 hover:text-neutral-200 after:h-0.5 after:origin-center after:transition-all after:duration-300 data-active:text-[#FFA546]! data-active:after:bg-[#FFA546]"
            >
              预售
            </TabsTrigger>
            <TabsTrigger
              value="vesting"
              className="flex-1 rounded-none py-2.5 text-xs font-bold text-neutral-400 transition-colors duration-300 hover:text-neutral-200 after:h-0.5 after:origin-center after:transition-all after:duration-300 data-active:text-[#FFA546]! data-active:after:bg-[#FFA546]"
            >
              解锁
            </TabsTrigger>
            <TabsTrigger
              value="chart"
              className="flex-1 rounded-none py-2.5 text-xs font-bold text-neutral-400 transition-colors duration-300 hover:text-neutral-200 after:h-0.5 after:origin-center after:transition-all after:duration-300 data-active:text-[#FFA546]! data-active:after:bg-[#FFA546]"
            >
              图表 / 交易
            </TabsTrigger>
          </TabsList>

          {/* ===================== TAB 1: 预售认购面板 ===================== */}
          <TabsContent value="presale" className="space-y-4">
            {/* 上部：预售参数详情列表 (Figma #6501:6205) */}
            <div className="flex flex-col divide-y divide-white/5 border border-[#2F3737] bg-[#141517] p-4 text-xs">
              <div className="flex items-center justify-between py-2">
                <span className="text-neutral-400">预售总份额</span>
                <span className="font-mono font-medium text-white">
                  {formatTokenSupply(presaleShareDisplay, locale)}{' '}
                  {token?.symbol}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-neutral-400">预售价</span>
                <span className="font-mono font-medium text-white">
                  {presalePriceNum > 0
                    ? `${formatDecimalText(presalePriceNum)} BNB`
                    : '--'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-neutral-400">募资硬顶</span>
                <span className="font-mono font-medium text-white">
                  {hardCapNum > 0
                    ? `${formatDecimalText(hardCapNum)} BNB`
                    : '不设硬顶'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-neutral-400">预售软顶</span>
                <span className="font-mono font-medium text-white">
                  {softCapNum > 0
                    ? `${formatDecimalText(softCapNum)} BNB`
                    : '--'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-neutral-400">单钱包认购上限</span>
                <span className="font-mono font-medium text-white">
                  {maxBuyBnbNum > 0
                    ? `${formatDecimalText(maxBuyBnbNum)} BNB`
                    : '--'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-neutral-400">释放周期</span>
                <span className="font-mono font-medium text-white">
                  每{' '}
                  {Number(vestingDelay) <= 0
                    ? '7 天'
                    : Number(vestingDelay) % 86400 === 0
                      ? `${Number(vestingDelay) / 86400} 天`
                      : Number(vestingDelay) % 3600 === 0
                        ? `${Number(vestingDelay) / 3600} 小时`
                        : Number(vestingDelay) % 60 === 0
                          ? `${Number(vestingDelay) / 60} 分钟`
                          : `${Number(vestingDelay)} 秒`}{' '}
                  释放 {Number(vestingRate)}%
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-neutral-400">底池配比</span>
                <span className="font-mono font-medium text-white">
                  100% 募资 BNB + 20% 代币
                </span>
              </div>
            </div>

            {/* 下部：参与预售交互卡片 (Figma #6501:6230) */}
            <div className="flex flex-col gap-4 border border-[#2F3737] bg-[#141517] p-4 shadow-xl">
              {presaleStatus === 4 ? (
                <>
                  {/* 预售失败提示 */}
                  <div className="flex items-start gap-2.5 rounded border border-red-500/25 bg-red-500/10 p-3">
                    <XCircle className="mt-0.5 size-5 shrink-0 text-red-400" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold text-red-400">
                        预售失败
                      </span>
                      <span className="text-xs leading-relaxed text-neutral-400">
                        本次认购未达到软顶要求（或超时未开盘），预售已终止，代币不会上线。您可发起退款收回认购的
                        BNB，退款后认购份额作废。
                      </span>
                    </div>
                  </div>

                  {/* 退款区 */}
                  <div className="flex flex-col gap-3 border border-[#2F3737] bg-[#181a1d] p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">可退金额</span>
                      <span className="font-mono font-medium text-white">
                        {formatDecimalText(
                          Number(formatEther(userContribution)),
                        )}{' '}
                        BNB
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">对应认购份额</span>
                      <span className="font-mono text-neutral-300">
                        {formatTokenSupply(userShare, locale)} {token?.symbol}
                        （退款后作废）
                      </span>
                    </div>
                    <Button
                      type="button"
                      disabled={isRefunding || userContribution <= 0n}
                      onClick={handleRefund}
                      className="h-10 w-full border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-sm font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5 disabled:opacity-50"
                    >
                      {isRefunding ? (
                        <>
                          <Loader2 className="mr-1.5 size-4 animate-spin" />
                          退款处理中…
                        </>
                      ) : userContribution > 0n ? (
                        '申请退款'
                      ) : (
                        '无可退款金额'
                      )}
                    </Button>
                    <p className="text-xs text-neutral-500">
                      退款按原路返回您的钱包；如已退款则显示无可退金额。
                    </p>
                  </div>
                </>
              ) : (
                <>
              {/* 预售售罄进度条 (Binding Curve Percentage) */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white tracking-wide">
                    预售售罄进度
                  </span>
                  <span className="font-mono font-bold text-[#FE810B]">
                    {tokenSalesPercent}%
                  </span>
                </div>
                <Progress
                  value={tokenSalesPercent}
                  className="h-2 w-full bg-[#111213]"
                />
                <p className="text-xs text-neutral-400">
                  当进度达到 100% 时，预售结束并自动触发一键加池开盘。
                </p>
              </div>

              {/* 软顶达成进度条 */}
              <div className="flex flex-col gap-1.5 border-t border-white/5 pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-300">软顶达成进度</span>
                  <span className="font-mono text-neutral-300">
                    <strong className="text-white">
                      {formatDecimalText(bnbAccumulatedNum)}
                    </strong>{' '}
                    / {softCapNum > 0 ? `${formatDecimalText(softCapNum)} BNB` : '--'}
                    <span
                      className={cn(
                        'ml-1.5 font-bold',
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

              {/* 硬顶达成进度条 (若配置了硬顶) */}
              {hardCapNum > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-white/5 pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-300">
                      募资硬顶进度
                    </span>
                    <span className="font-mono text-neutral-300">
                      <strong className="text-white">
                        {formatDecimalText(bnbAccumulatedNum)}
                      </strong>{' '}
                      / {formatDecimalText(hardCapNum)} BNB
                      <span className="ml-1.5 font-bold text-[#FFA546]">
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

              {/* 认购到期：任何人可触发结束预售（软顶已达成 → 待开盘；未达 → 退款流程） */}
              {isPresaleWindowOver ? (
                <div className="flex flex-col gap-3 rounded border border-[#2F3737] bg-[#181a1d] p-3">
                  <div className="flex items-start gap-2.5">
                    <Clock
                      className={cn(
                        'mt-0.5 size-5 shrink-0',
                        isSoftCapReached
                          ? 'text-emerald-400'
                          : 'text-amber-400',
                      )}
                    />
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={cn(
                          'text-sm font-bold',
                          isSoftCapReached
                            ? 'text-emerald-400'
                            : 'text-amber-400',
                        )}
                      >
                        {isSoftCapReached
                          ? '认购已到期 · 软顶已达成'
                          : '认购已到期 · 未达软顶'}
                      </span>
                      <span className="text-xs leading-relaxed text-neutral-400">
                        {isSoftCapReached
                          ? '认购窗口已结束，募集资金已达软顶。触发结束预售后将进入待开盘阶段，创建者需在 72 小时内加池上线。'
                          : '认购窗口已结束且未达软顶。触发结束预售后将转入退款流程，届时认购者可按原路申请退款。'}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    disabled={isEndingPresale}
                    onClick={handleTriggerEndPresale}
                    className="h-10 w-full border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-sm font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5 disabled:opacity-50"
                  >
                    {isEndingPresale ? (
                      <>
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                        处理中…
                      </>
                    ) : isSoftCapReached ? (
                      '结束预售 (进入待开盘)'
                    ) : (
                      '结束预售 (开启退款)'
                    )}
                  </Button>
                  <p className="text-xs text-neutral-500">
                    认购到期后任何人都可以触发结束预售，无需等待创建者操作。
                  </p>
                </div>
              ) : (
                <>
              {/* 认购输入与余额区 */}
              <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">参与预售</span>
                  <div className="flex items-center gap-2.5 text-neutral-400">
                    {remainingMaxBnbQuota !== null && (
                      <span>
                        单钱包限购剩余：
                        <strong className="font-mono text-[#FFA546]">
                          {formatDecimalText(remainingMaxBnbQuota)} BNB
                        </strong>
                      </span>
                    )}
                    <span>
                      钱包余额：
                      <strong className="font-mono text-white">
                        {formatDecimalText(userBnbBalance)} BNB
                      </strong>
                    </span>
                  </div>
                </div>

                {/* 输入框 */}
                <div
                  className={cn(
                    'flex h-11 items-center justify-between border border-[#484b51] bg-[#181a1d] px-3 focus-within:border-[#FE810B] transition-colors',
                    isOverWalletLimit && 'border-red-500',
                  )}
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder=""
                    value={subscribeAmount}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setSubscribeAmount(val)
                      }
                    }}
                    className="w-full bg-transparent font-mono text-sm font-medium text-white placeholder:text-neutral-600 focus:outline-none"
                  />
                  <span className="ml-2 font-mono text-xs font-bold text-[#FFA546] select-none">
                    BNB
                  </span>
                </div>
                {isOverWalletLimit && (
                  <span className="text-xs text-red-500">
                    超出单钱包限额！您当前最多还可认购 {remainingMaxBnbQuota} BNB
                  </span>
                )}

                {/* 快捷百分比 (25% / 50% / 75% / 100%) */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[25, 50, 75, 100].map((percent) => (
                    <button
                      key={percent}
                      type="button"
                      onClick={() => handlePercentClick(percent)}
                      className="flex h-8 cursor-pointer items-center justify-center border border-[#2F3737] bg-[#1a1c1e] text-xs font-semibold text-neutral-300 transition-all select-none active:scale-95 hover:border-[#FE810B] hover:text-[#FFA546]"
                    >
                      {percent}%
                    </button>
                  ))}
                </div>

                {/* 预估换算 */}
                <div className="flex items-center justify-between pt-1 text-xs text-neutral-400">
                  <span>
                    预计获得：
                    <strong className="font-mono text-white">
                      {estimatedTokens}
                    </strong>{' '}
                    {token?.symbol}
                  </span>
                  <span>全额按预售价计算</span>
                </div>
              </div>

              {/* 参与预售主按钮 */}
              <Web3ActionButton
                type="button"
                size="default"
                onAction={handleSubscribe}
                loading={isSubscribing}
                loadingText="认购处理中…"
                disabled={presaleStatus !== 1 || isOverWalletLimit}
                className="h-11 w-full border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-base font-bold text-white shadow-[0_3px_0_0_#963000] transition-transform active:translate-y-0.5 disabled:opacity-50"
              >
                <span>
                  {presaleStatus === 0
                    ? '预售尚未开启'
                    : presaleStatus === 1
                      ? '参与预售'
                      : presaleStatus === 2
                        ? '预售已结束 (待开盘)'
                        : '预售已结束'}
                </span>
              </Web3ActionButton>
                </>
              )}
                </>
              )}
            </div>
          </TabsContent>

          {/* ===================== TAB 2: 解锁领取面板 ===================== */}
          <TabsContent value="vesting" className="space-y-4">
            <div className="flex flex-col divide-y divide-white/5 border border-[#2F3737] bg-[#141517] p-4 text-xs">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-neutral-400">我的认购总份额</span>
                <span className="font-mono font-bold text-white">
                  {Number(formatEther(userShare)).toLocaleString()} {token?.symbol}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-neutral-400">已领取代币</span>
                <span className="font-mono font-medium text-neutral-300">
                  {Number(formatEther(userClaimed)).toLocaleString()}{' '}
                  {token?.symbol}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-neutral-400">当前可领取</span>
                <span className="font-mono font-bold text-[#FFA546]">
                  {Number(formatEther(userClaimable)).toLocaleString()}{' '}
                  {token?.symbol}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-neutral-400">下期解锁时间</span>
                <span className="font-mono text-white">
                  {nextVestingTime > 0n
                    ? new Date(Number(nextVestingTime) * 1000).toLocaleString()
                    : presaleStatus === 3
                      ? '全部周期已释放完毕'
                      : '开盘加池后启动计时'}
                </span>
              </div>
            </div>

            <Web3ActionButton
              type="button"
              size="default"
              onAction={handleClaimVesting}
              loading={isClaimingVesting}
              loadingText="领取中…"
              disabled={userClaimable <= 0n || presaleStatus !== 3}
              className="h-11 w-full border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-sm font-bold text-white shadow-[0_3px_0_0_#963000] transition-transform active:translate-y-0.5 disabled:opacity-50"
            >
              <Gift className="size-4" />
              <span>
                {presaleStatus !== 3
                  ? '待开盘上线后方可领取'
                  : userClaimable > 0n
                    ? '领取代币份额'
                    : '暂无可领取份额'}
              </span>
            </Web3ActionButton>
          </TabsContent>

          {/* ===================== TAB 3: 图表与交易 ===================== */}
          <TabsContent value="chart" className="space-y-4">
            <div className="flex flex-col items-center justify-center border border-[#2F3737] bg-[#141517] p-8 text-center text-xs">
              <TrendingUp className="size-10 text-[#FFA546] mb-3" />
              <h3 className="text-sm font-bold text-white">DEX 价格与行情走势</h3>
              <p className="mt-1 max-w-xs leading-relaxed text-neutral-400">
                {presaleStatus === 3
                  ? '该代币已在 PancakeSwap 上线交易，LP 流动性池已永久销毁死锁。'
                  : '当前处于预售阶段。预售达标加池后，此处将展示实时交易 K 线图表与流动性数据。'}
              </p>

              {presaleStatus === 3 && (
                <a
                  href={`https://pancakeswap.finance/swap?outputCurrency=${tokenAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-none border border-white/30 bg-[#1a1c1e] px-4 py-2 text-xs font-bold text-white hover:border-[#FE810B]"
                >
                  <span>前往 PancakeSwap 交易</span>
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        /* 未开启预售 / 纯发币代币：直接展示 DEX 行情与现货交易看板 */
        <div className="space-y-4">
          <div className="flex flex-col gap-3 border border-[#2F3737] bg-[#141517] p-5 text-xs">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-[#FFA546]" />
                <span className="text-sm font-bold text-white">DEX 现货行情</span>
              </div>
              <span className="text-xs font-mono text-[#0ECB81]">已在 DEX 自由交易</span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="flex flex-col gap-1 border border-[#2F3737] bg-[#181a1d] p-3">
                <span className="text-xs text-neutral-400">当前代币单价</span>
                <span className="font-mono text-base font-bold text-white">
                  {tokenPriceData.priceUSD !== null
                    ? `$${formatNumber(tokenPriceData.priceUSD, 'zh-TW')}`
                    : '--'}
                </span>
                {tokenPriceData.priceBNB !== null && (
                  <span className="font-mono text-xs text-neutral-400">
                    ≈ {formatDecimalText(tokenPriceData.priceBNB)} BNB
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1 border border-[#2F3737] bg-[#181a1d] p-3">
                <span className="text-xs text-neutral-400">流通市值</span>
                <span className="font-mono text-base font-bold text-[#FFA546]">
                  {tokenPriceData.mcapUSD !== null
                    ? `$${formatNumber(tokenPriceData.mcapUSD, 'zh-TW')}`
                    : '--'}
                </span>
                <span className="text-xs text-neutral-400">总量恒定 100% 流通</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>交易滑点参考</span>
                <span className="text-neutral-300">
                  买税 {token?.buyTax ?? 0}% / 卖税 {token?.sellTax ?? 0}%
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>流动性池 (Pancake V2)</span>
                <span className="font-mono text-white">
                  {tokenPriceData.stage === 'live' ? '已加池' : '用户自加池'}
                </span>
              </div>
            </div>

            <a
              href={`https://pancakeswap.finance/swap?outputCurrency=${tokenAddress}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-sm font-bold text-white shadow-[0_3px_0_0_#963000] transition-transform active:translate-y-0.5"
            >
              <span>前往 PancakeSwap 交易</span>
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
