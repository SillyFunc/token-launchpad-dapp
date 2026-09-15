import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useBalance, useConfig, useConnection, useReadContract } from 'wagmi'
import { waitForTransactionReceipt, writeContract } from '@wagmi/core'
import { AlertTriangle, Clock, Loader2 } from 'lucide-react'
import { formatEther, parseEther, type Hex } from 'viem'

import type { TokenDetail } from '@/api/token'
import { Web3ActionButton } from '@/components/common/web3-action-button'
import { Progress } from '@/components/ui/progress'
import { toast } from '@/components/ui/toast'
import { PresaleAbi } from '@/contracts/abi'
import { DEFAULT_CHAIN_ID } from '@/config/network'
import { useTokenGate } from '@/hooks/use-token-gate'
import { parseContractError } from '@/lib/contract-error'
import { formatDecimalText, formatTokenSupply } from '@/lib/format'
import type { Locale } from '@/lib/i18n'

interface TokenPresaleProps {
  token?: TokenDetail
  tokenAddress?: Hex
  locale: Locale
}

const GAS_RESERVE = parseEther('0.005')
const TOKEN_UNIT = 10n ** 18n

function formatBnb(value: bigint): string {
  return `${formatDecimalText(formatEther(value))} BNB`
}

function formatCountdown(seconds: number): string {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const remainingSeconds = seconds % 60
  const clock = [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')

  return days > 0 ? `${days}天 ${clock}` : clock
}

function formatVestingDelay(delay: bigint): string {
  const seconds = Number(delay)
  if (seconds <= 0) return '--'
  if (seconds % 86_400 === 0) return `${seconds / 86_400} 天`
  if (seconds % 3_600 === 0) return `${seconds / 3_600} 小时`
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`
  return `${seconds} 秒`
}

function getProgress(value: bigint, total: bigint): number {
  if (total <= 0n) return 0
  return Math.min(100, Number((value * 10_000n) / total) / 100)
}

function parseBnbInput(value: string): bigint | null {
  if (!value) return 0n
  try {
    return parseEther(value)
  } catch {
    return null
  }
}

function minimum(values: Array<bigint | null>): bigint | null {
  const validValues = values.filter((value): value is bigint => value !== null)
  return validValues.length > 0
    ? validValues.reduce((current, value) => (value < current ? value : current))
    : null
}

function PresaleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-xs">
      <span className="text-[#A0A3A7]">{label}</span>
      <span className="text-right font-mono text-foreground">{value}</span>
    </div>
  )
}

export function TokenPresale({
  token,
  tokenAddress,
  locale,
}: TokenPresaleProps) {
  const config = useConfig()
  const queryClient = useQueryClient()
  const { address: userAddress } = useConnection()
  const [subscribeAmount, setSubscribeAmount] = useState('')
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1_000))
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [isRefunding, setIsRefunding] = useState(false)
  const [isEndingPresale, setIsEndingPresale] = useState(false)

  const {
    isIssued,
    isChainLoading,
    presaleAddress,
    presaleConfigured,
    presaleEnabled,
    presaleStatus,
    bnbAccumulated,
    tokensSubscribed,
    presaleShare,
    softCap,
    hardCap,
    isSoftCapReached,
    isSoldOut,
    vestingDelay,
    vestingRate,
    onchainPresalePrice,
    onchainMaxBuy,
    presaleStartTime,
    presaleEndTime,
  } = useTokenGate({ tokenAddress, token, watch: true })

  const { data: balanceData } = useBalance({
    address: userAddress,
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: Boolean(userAddress), staleTime: 10_000 },
  })
  const { data: subscribedTokensData, refetch: refetchSubscribedTokens } =
    useReadContract({
      address: presaleAddress,
      abi: PresaleAbi,
      functionName: 'subscribedTokens',
      args: userAddress ? [userAddress] : undefined,
      chainId: DEFAULT_CHAIN_ID,
      query: {
        enabled: Boolean(presaleAddress && userAddress),
        staleTime: 5_000,
      },
    })
  const { data: contributionData, refetch: refetchContribution } =
    useReadContract({
      address: presaleAddress,
      abi: PresaleAbi,
      functionName: 'contributions',
      args: userAddress ? [userAddress] : undefined,
      chainId: DEFAULT_CHAIN_ID,
      query: {
        enabled: Boolean(presaleAddress && userAddress && presaleStatus === 4),
        staleTime: 5_000,
      },
    })

  useEffect(() => {
    if (presaleStatus !== 1) return

    const timer = window.setInterval(
      () => setNowSeconds(Math.floor(Date.now() / 1_000)),
      1_000,
    )
    return () => window.clearInterval(timer)
  }, [presaleStatus])

  const userSubscribedTokens =
    (subscribedTokensData as bigint | undefined) ?? 0n
  const userContribution = (contributionData as bigint | undefined) ?? 0n
  const startTimeSeconds = Number(presaleStartTime ?? 0n)
  const endTimeSeconds = Number(presaleEndTime ?? 0n)
  const hasNotStarted =
    presaleStatus === 1 && startTimeSeconds > 0 && nowSeconds < startTimeSeconds
  const hasEnded =
    presaleStatus === 1 && endTimeSeconds > 0 && nowSeconds >= endTimeSeconds
  const isPresaleActive =
    presaleStatus === 1 && !hasNotStarted && !hasEnded && !isSoldOut
  const countdownSeconds = hasNotStarted
    ? Math.max(0, startTimeSeconds - nowSeconds)
    : Math.max(0, endTimeSeconds - nowSeconds)
  const parsedAmount = parseBnbInput(subscribeAmount)
  const walletBalance = balanceData?.value ?? null
  const spendableBalance =
    walletBalance === null
      ? null
      : walletBalance > GAS_RESERVE
        ? walletBalance - GAS_RESERVE
        : 0n
  const remainingWalletTokens =
    onchainMaxBuy > 0n
      ? userSubscribedTokens >= onchainMaxBuy
        ? 0n
        : onchainMaxBuy - userSubscribedTokens
      : null
  const remainingWalletBnb =
    remainingWalletTokens === null || onchainPresalePrice <= 0n
      ? null
      : (remainingWalletTokens * onchainPresalePrice) / TOKEN_UNIT
  const remainingHardCap =
    hardCap > 0n
      ? bnbAccumulated >= hardCap
        ? 0n
        : hardCap - bnbAccumulated
      : null
  const maxContribution = minimum([
    spendableBalance,
    remainingWalletBnb,
    remainingHardCap,
  ])
  const estimatedTokens =
    parsedAmount && parsedAmount > 0n && onchainPresalePrice > 0n
      ? (parsedAmount * TOKEN_UNIT) / onchainPresalePrice
      : 0n
  const isAmountOverLimit =
    parsedAmount === null ||
    (parsedAmount !== null &&
      maxContribution !== null &&
      parsedAmount > maxContribution)
  const tokenProgress = getProgress(tokensSubscribed, presaleShare)
  const softCapProgress = getProgress(bnbAccumulated, softCap)
  const hardCapProgress = getProgress(bnbAccumulated, hardCap)

  const refreshPresale = async () => {
    await queryClient.invalidateQueries({ queryKey: ['readContracts'] })
    void refetchSubscribedTokens()
    void refetchContribution()
  }

  const handleSubscribe = async () => {
    if (!presaleAddress || !isPresaleActive) {
      toast.error('预售当前不可认购')
      return
    }
    if (parsedAmount === null || parsedAmount <= 0n) {
      toast.error('请输入有效且大于 0 的认购金额')
      return
    }
    if (walletBalance !== null && parsedAmount + GAS_RESERVE > walletBalance) {
      toast.error('钱包余额不足，请预留至少 0.005 BNB 作为 Gas')
      return
    }
    if (isAmountOverLimit) {
      toast.error('输入金额超过当前可认购上限')
      return
    }

    setIsSubscribing(true)
    try {
      const hash = await writeContract(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'subscribe',
        chainId: DEFAULT_CHAIN_ID,
        value: parsedAmount,
      })
      await waitForTransactionReceipt(config, { hash, chainId: DEFAULT_CHAIN_ID })
      await refreshPresale()
      setSubscribeAmount('')
      toast.success('认购成功！代币份额已锁定在托管仓')
    } catch (error: unknown) {
      toast.error(parseContractError(error, '认购失败，请稍后重试'), '认购失败')
    } finally {
      setIsSubscribing(false)
    }
  }

  const handleRefund = async () => {
    if (!presaleAddress || userContribution <= 0n) return

    setIsRefunding(true)
    try {
      const hash = await writeContract(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'refund',
        chainId: DEFAULT_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, { hash, chainId: DEFAULT_CHAIN_ID })
      await refreshPresale()
      toast.success('退款成功，资金已原路退回钱包')
    } catch (error: unknown) {
      toast.error(parseContractError(error, '退款失败，请稍后重试'), '退款失败')
    } finally {
      setIsRefunding(false)
    }
  }

  const handleEndPresale = async () => {
    if (!presaleAddress || !hasEnded) return

    setIsEndingPresale(true)
    try {
      const hash = await writeContract(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'endPresale',
        chainId: DEFAULT_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, { hash, chainId: DEFAULT_CHAIN_ID })
      await refreshPresale()
      toast.success(
        isSoftCapReached
          ? '预售已结算，进入待开盘阶段'
          : '预售已结算，退款通道已开启',
      )
    } catch (error: unknown) {
      toast.error(parseContractError(error, '结束预售失败，请稍后重试'), '操作失败')
    } finally {
      setIsEndingPresale(false)
    }
  }

  const handlePercentClick = (percent: number) => {
    if (!maxContribution || maxContribution <= 0n) return
    setSubscribeAmount(formatEther((maxContribution * BigInt(percent)) / 100n))
  }

  if (isChainLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 text-xs text-[#A0A3A7]">
        <Loader2 className="size-4 animate-spin text-[#FFA546]" />
        正在读取预售链上状态…
      </div>
    )
  }

  if (!isIssued) {
    return (
      <StatusMessage
        title="代币尚未发行"
        description="代币完成链上发行后，才能配置并参与预售。"
      />
    )
  }

  if (!presaleConfigured || !presaleAddress || !presaleEnabled) {
    return (
      <StatusMessage
        title="预售尚未开启"
        description="该代币当前没有可参与的预售。"
      />
    )
  }

  if (presaleStatus === 0) {
    return (
      <StatusMessage
        title="预售待开启"
        description="创建者尚未开启预售，认购通道暂未开放。"
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="border border-foreground/10 bg-foreground/3 px-3">
        <PresaleRow
          label="预售份额"
          value={
            presaleShare > 0n
              ? `${formatTokenSupply(presaleShare, locale)} ${token?.symbol || ''}`
              : '--'
          }
        />
        <PresaleRow
          label="预售价"
          value={onchainPresalePrice > 0n ? formatBnb(onchainPresalePrice) : '--'}
        />
        <PresaleRow
          label="单钱包上限"
          value={
            onchainMaxBuy > 0n
              ? `${formatTokenSupply(onchainMaxBuy, locale)} ${token?.symbol || ''}`
              : '--'
          }
        />
        <PresaleRow label="软顶" value={softCap > 0n ? formatBnb(softCap) : '--'} />
        <PresaleRow
          label="硬顶"
          value={hardCap > 0n ? formatBnb(hardCap) : '不设硬顶'}
        />
        <PresaleRow
          label="解锁规则"
          value={
            vestingRate > 0n
              ? `每 ${formatVestingDelay(vestingDelay)} 解锁 ${vestingRate}%`
              : '--'
          }
        />
      </section>

      {presaleStatus === 1 && (
        <>
          <section className="flex flex-col gap-3 border border-foreground/10 bg-foreground/3 p-3">
            <PresaleProgress
              label="预售进度"
              value={tokenProgress}
              detail={`${formatTokenSupply(tokensSubscribed, locale)} / ${formatTokenSupply(presaleShare, locale)} ${token?.symbol || ''}`}
            />
            <PresaleProgress
              label="软顶进度"
              value={softCapProgress}
              detail={softCap > 0n ? `${formatBnb(bnbAccumulated)} / ${formatBnb(softCap)}` : '--'}
              highlight={isSoftCapReached}
            />
            {hardCap > 0n && (
              <PresaleProgress
                label="硬顶进度"
                value={hardCapProgress}
                detail={`${formatBnb(bnbAccumulated)} / ${formatBnb(hardCap)}`}
              />
            )}
          </section>

          {hasEnded ? (
            <section className="flex flex-col gap-3 border border-amber-400/30 bg-amber-400/10 p-3">
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 size-4 shrink-0 text-amber-300" />
                <div className="flex flex-col gap-1 text-xs">
                  <strong className="text-amber-200">认购时间已结束</strong>
                  <span className="leading-5 text-[#A0A3A7]">
                    {isSoftCapReached
                      ? '软顶已达成。任何人均可结算预售，随后由创建者开盘加池。'
                      : '未达软顶。结算后将开放认购款退款。'}
                  </span>
                </div>
              </div>
              <Web3ActionButton
                onAction={handleEndPresale}
                loading={isEndingPresale}
                loadingText="正在结算…"
                className="h-10 w-full bg-[#FFA546] text-sm font-semibold text-black hover:bg-[#ffb866]"
              >
                结算预售
              </Web3ActionButton>
            </section>
          ) : hasNotStarted ? (
            <StatusMessage
              title="预售尚未开始"
              description={`距离开始：${formatCountdown(countdownSeconds)}`}
            />
          ) : (
            <section className="flex flex-col gap-3 border border-foreground/10 bg-foreground/3 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#A0A3A7]">距离结束</span>
                <strong className="font-mono text-[#FFA546]">
                  {formatCountdown(countdownSeconds)}
                </strong>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#A0A3A7]">钱包余额</span>
                <span className="font-mono text-foreground">
                  {walletBalance === null ? '--' : formatBnb(walletBalance)}
                </span>
              </div>
              {remainingWalletBnb !== null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#A0A3A7]">单钱包剩余额度</span>
                  <span className="font-mono text-foreground">
                    {formatBnb(remainingWalletBnb)}
                  </span>
                </div>
              )}
              <div className="flex h-11 items-center border border-foreground/15 bg-background px-3 focus-within:border-primary">
                <input
                  type="text"
                  inputMode="decimal"
                  value={subscribeAmount}
                  onChange={(event) => {
                    const value = event.target.value
                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                      setSubscribeAmount(value)
                    }
                  }}
                  placeholder="输入认购金额"
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-[#84888C]"
                />
                <span className="ml-2 text-xs font-semibold text-[#FFA546]">BNB</span>
              </div>
              {isAmountOverLimit && (
                <span className="text-xs text-red-400">输入金额超过当前可认购上限</span>
              )}
              <div className="grid grid-cols-4 gap-2">
                {[25, 50, 75, 100].map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    onClick={() => handlePercentClick(percent)}
                    disabled={!maxContribution || maxContribution <= 0n}
                    className="h-8 border border-foreground/10 bg-foreground/5 text-xs text-[#A0A3A7] transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {percent}%
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#A0A3A7]">预计获得</span>
                <span className="font-mono text-foreground">
                  {formatTokenSupply(estimatedTokens, locale)} {token?.symbol || ''}
                </span>
              </div>
              <Web3ActionButton
                onAction={handleSubscribe}
                loading={isSubscribing}
                loadingText="认购处理中…"
                disabled={
                  !isPresaleActive ||
                  parsedAmount === null ||
                  parsedAmount <= 0n ||
                  isAmountOverLimit
                }
                className="h-11 w-full bg-[#FFA546] text-sm font-semibold text-black hover:bg-[#ffb866]"
              >
                参与预售
              </Web3ActionButton>
            </section>
          )}
        </>
      )}

      {presaleStatus === 2 && (
        <StatusMessage
          title="认购已结束，等待开盘"
          description="创建者正在准备加池开盘，当前无法继续认购。"
        />
      )}

      {presaleStatus === 3 && (
        <StatusMessage
          title="预售已完成"
          description="代币已开盘，可前往图表查看行情并进行交易。"
        />
      )}

      {presaleStatus === 4 && (
        <section className="flex flex-col gap-3 border border-red-400/30 bg-red-400/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-300" />
            <div className="flex flex-col gap-1 text-xs">
              <strong className="text-red-200">预售未达软顶</strong>
              <span className="leading-5 text-[#A0A3A7]">
                您可领取原路退回的认购资金。
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#A0A3A7]">可退款金额</span>
            <span className="font-mono text-foreground">{formatBnb(userContribution)}</span>
          </div>
          <Web3ActionButton
            onAction={handleRefund}
            loading={isRefunding}
            loadingText="退款处理中…"
            disabled={Boolean(userAddress) && userContribution <= 0n}
            className="h-10 w-full bg-red-400 text-sm font-semibold text-black hover:bg-red-300"
          >
            {userContribution > 0n ? '申请退款' : '暂无可退款金额'}
          </Web3ActionButton>
        </section>
      )}
    </div>
  )
}

function PresaleProgress({
  label,
  value,
  detail,
  highlight = false,
}: {
  label: string
  value: number
  detail: string
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-[#A0A3A7]">{label}</span>
        <span className="min-w-0 truncate text-right font-mono text-foreground">
          {detail} <strong className={highlight ? 'text-[#0ECB81]' : 'text-[#FFA546]'}>{value.toFixed(2)}%</strong>
        </span>
      </div>
      <Progress value={value} className="h-1.5 bg-foreground/10" />
    </div>
  )
}

function StatusMessage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-6 text-center">
      <Clock className="size-6 text-[#FFA546]" aria-hidden="true" />
      <strong className="text-sm text-foreground">{title}</strong>
      <span className="text-xs leading-5 text-[#A0A3A7]">{description}</span>
    </div>
  )
}
