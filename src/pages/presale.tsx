import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useConnection, useConfig } from 'wagmi'
import { signMessage } from '@wagmi/core'
import { parseEther, parseUnits } from 'viem'
import {
  Rocket,
  Coins,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Info,
  ShieldCheck,
  Clock,
} from 'lucide-react'

import {
  getTokenByContractAddress,
  savePresaleInfo,
} from '@/api/token'
import { getSignMessage } from '@/api/auth'
import { NumericInput } from '@/components/ui/numeric-keypad'
import { toast } from '@/components/ui/toast'
import sectionIcon from '@/assets/icons/section-title-icon.svg'
import titleBackArrow from '@/assets/icons/back-arrow.svg'

function formatAddress(addr?: string): string {
  if (!addr) return '--'
  if (addr.length <= 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

interface SectionHeaderProps {
  title: string
  required?: boolean
  badge?: string
}

function SectionHeader({ title, required = false, badge }: SectionHeaderProps) {
  return (
    <div className="relative flex items-center justify-between">
      <div className="relative flex items-center gap-2">
        <img
          src={sectionIcon}
          alt=""
          aria-hidden="true"
          width={16}
          height={16}
          className="absolute -left-6 size-4 align-middle"
        />
        <h2 className="pl-1.5 text-base font-normal uppercase leading-normal text-white">
          {title}
          {required && <span className="ml-0.5 text-[#f7594b]">*</span>}
        </h2>
      </div>
      {badge && (
        <span className="rounded bg-[#FE810B]/15 px-2 py-0.5 text-xs font-semibold text-[#FFA546]">
          {badge}
        </span>
      )}
    </div>
  )
}

export const Presale = () => {
  const [searchParams] = useSearchParams()
  const tokenAddress = searchParams.get('address') || ''
  const { address } = useConnection()
  const config = useConfig()

  const [copied, setCopied] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)

  // 1. 获取代币详细信息
  const {
    data: token,
    isLoading: isTokenLoading,
    isError: isTokenError,
  } = useQuery({
    queryKey: ['tokenDetail', tokenAddress],
    queryFn: () => getTokenByContractAddress(tokenAddress),
    enabled: Boolean(tokenAddress),
  })

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('已复制到剪贴板')
    setTimeout(() => setCopied(false), 2000)
  }

  // 2. 表单状态与验证
  const form = useForm({
    defaultValues: {
      presaleTokenPrice: '0.000001', // 每 1 枚代币的 BNB 价格
      maxBuyPerWallet: '100000000', // 每钱包认购代币上限 (默认 1 亿枚)
      softCap: '0.5', // 认购成功软顶 (BNB)
      minLiquidityAmount: '0.1', // 加池最低 BNB (默认 0.1)
      hardcap: '0', // 募资硬顶 (BNB，0 = 不限)
      vestingDelay: '7', // 释放周期 (天，7-90)
      vestingRate: '10', // 每期释放比例 (5-20%)
      slippage: '5', // 加池滑点保护 (0-10%，0 传默认 5%)
      startTimeType: 'immediate' as 'immediate' | 'custom',
      startTime: '',
      creatorBuyMode: 'none' as 'none' | 'quote' | 'token',
      creatorBuyBnb: '0', // 注资 BNB 数量
      creatorBuyTokens: '0', // 目标代币数量 (上限 5000 万枚)
    },
    onSubmit: async ({ value }) => {
      setSubmitError('')
      if (!address) {
        toast.error('请先连接钱包')
        return
      }
      if (!tokenAddress) {
        setSubmitError('未指定代币合约地址')
        return
      }

      // 业务逻辑二次防呆校验
      const softCapNum = Number(value.softCap)
      const minLiqNum = Number(value.minLiquidityAmount)
      const hardcapNum = Number(value.hardcap)

      if (softCapNum < minLiqNum) {
        setSubmitError('认购软顶 (softCap) 不能低于加池最低 BNB')
        return
      }

      if (hardcapNum > 0 && hardcapNum < softCapNum) {
        setSubmitError('募资硬顶 (hardcap) 必须大于或等于软顶 (softCap)')
        return
      }

      const creatorTokensNum = Number(value.creatorBuyTokens)
      const creatorBnbNum = Number(value.creatorBuyBnb)

      if (value.creatorBuyMode === 'token') {
        if (creatorTokensNum <= 0 || creatorTokensNum > 50000000) {
          setSubmitError('购买代币数量必须在 1 至 50,000,000 枚之间')
          return
        }
        if (creatorBnbNum <= 0) {
          setSubmitError('按代币数量买入必须同时提供大于 0 的 BNB 注资金额')
          return
        }
      }

      if (value.creatorBuyMode === 'quote' && creatorBnbNum <= 0) {
        setSubmitError('按金额买入必须提供大于 0 的 BNB 注资金额')
        return
      }

      try {
        // 1. 获取签名消息并由用户钱包签名
        const message = await getSignMessage(address)
        const signature = await signMessage(config, { message })

        // 2. 转换数值为合约规格（精度转换为 wei 字符串）
        const presaleTokenPriceWei = parseEther(
          value.presaleTokenPrice || '0.000001',
        ).toString()

        const maxBuyPerWalletWei = parseUnits(
          value.maxBuyPerWallet || '100000000',
          18,
        ).toString()

        const softCapWei = parseEther(value.softCap || '0.5').toString()
        const minLiquidityAmountWei = parseEther(
          value.minLiquidityAmount || '0.1',
        ).toString()

        const hardcapWei =
          hardcapNum > 0 ? parseEther(value.hardcap).toString() : '0'

        const vestingDelaySeconds = Number(value.vestingDelay) * 86400 // 天转秒
        const vestingRateNum = Number(value.vestingRate)
        const slippageBps = Math.round(Number(value.slippage) * 100) // % 转 bps

        const startTimeUnix =
          value.startTimeType === 'custom' && value.startTime
            ? Math.floor(new Date(value.startTime).getTime() / 1000)
            : 0

        const creatorBuyTokensWei =
          value.creatorBuyMode === 'token' && creatorTokensNum > 0
            ? parseUnits(value.creatorBuyTokens, 18).toString()
            : '0'

        const creatorBuyBnbWei =
          value.creatorBuyMode !== 'none' && creatorBnbNum > 0
            ? parseEther(value.creatorBuyBnb).toString()
            : '0'

        // 3. 提交至预售创建接口
        await savePresaleInfo({
          token: tokenAddress,
          presaleConfig: {
            presaleTokenPrice: presaleTokenPriceWei,
            maxBuyPerWallet: maxBuyPerWalletWei,
            hardcap: hardcapWei,
            minLiquidityAmount: minLiquidityAmountWei,
            softCap: softCapWei,
            startTime: startTimeUnix,
            vestingDelay: vestingDelaySeconds,
            vestingRate: vestingRateNum,
            slippage: slippageBps,
            creatorBuyTokens: creatorBuyTokensWei,
          },
          creatorBuyBnb: creatorBuyBnbWei,
          address,
          message,
          signature,
        })

        setIsSuccess(true)
        toast.success('预售条款配置成功！已准备发起预售。')
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : '配置预售失败，请稍后重试'
        setSubmitError(msg)
        toast.error(msg, '配置失败')
      }
    },
  })

  // 如果没有传入代币地址或代币不存在
  if (!tokenAddress) {
    return (
      <div className="relative mx-auto flex w-full flex-col pb-24 pt-6 text-white">
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#484b51] bg-[#131516] p-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[#FE810B]/10 text-[#FE810B]">
            <AlertTriangle className="size-7" />
          </div>
          <h2 className="mb-1 text-base font-bold text-white">
            未指定代币合约地址
          </h2>
          <p className="mb-6 max-w-sm text-xs text-neutral-400">
            请前往「控制台」选择您已发行的代币，并点击「我要预售」进入配置页面。
          </p>
          <Link
            to="/dashboard"
            className="cursor-pointer rounded-md bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] px-6 py-2 text-sm font-semibold text-white shadow-[0_3px_0_0_#963000]"
          >
            前往控制台
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form
      className="relative mx-auto flex w-full flex-col pb-28 pt-6"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void form.handleSubmit()
      }}
    >
      {/* 顶部标题栏 */}
      <div className="mb-4 flex items-center justify-between">
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
            <h1 className="text-lg font-semibold tracking-wide text-white">
              开启代币预售
            </h1>
            <p className="text-xs text-neutral-400">
              设置代币预售价格、认购限额、募资软硬顶与线性释放规则
            </p>
          </div>
        </div>
      </div>

      {/* 代币概览卡片 */}
      <div className="mb-6 border border-[#484b51] bg-[#131516] p-4">
        {isTokenLoading ? (
          <div className="flex animate-pulse items-center gap-3">
            <div className="size-12 rounded bg-neutral-800" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-neutral-800" />
              <div className="h-3 w-48 rounded bg-neutral-800" />
            </div>
          </div>
        ) : isTokenError || !token ? (
          <div className="flex items-center justify-between text-xs text-amber-400">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4" />
              <span>无法获取代币详细信息，但仍可针对合约地址进行配置</span>
            </div>
            <span className="font-mono text-white">
              {formatAddress(tokenAddress)}
            </span>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#484b51] bg-[#1a1c1e]">
                {token.coinImg ? (
                  <img
                    src={token.coinImg}
                    alt={token.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <Coins className="size-6 text-[#FFA546]" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-base font-bold text-white">
                    {token.name}
                  </span>
                  <span className="shrink-0 rounded bg-[#FE810B]/15 px-2 py-0.5 text-xs font-semibold text-[#FFA546]">
                    {token.symbol}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
                  <span className="font-mono">
                    CA: {formatAddress(token.coinContractAddress || tokenAddress)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(token.coinContractAddress || tokenAddress)
                    }
                    className="cursor-pointer text-neutral-400 hover:text-white"
                  >
                    {copied ? (
                      <Check className="size-3 text-green-400" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                  <a
                    href={`https://testnet.bscscan.com/address/${token.coinContractAddress || tokenAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-400 hover:text-[#FFA546]"
                  >
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            </div>

            <div className="hidden text-right text-xs text-neutral-400">
              <div>预售份额: 50% (5亿枚)</div>
              <div>底池份额: 20% (2亿枚)</div>
            </div>
          </div>
        )}
      </div>

      {/* 主表单面板 */}
      <div className="flex flex-col border border-[#484b51] bg-[#131516]">
        {/* 固定规则横幅说明 */}
        <div className="border-b border-[#484b51] bg-[#17191b] p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[#FFA546]">
            <Info className="size-4 shrink-0" />
            <span>智能合约固定不可篡改条款说明</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-300">
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#FE810B]" />
              <span>
                份额划分：<strong className="text-white">30%</strong> 创建者 /{' '}
                <strong className="text-white">20%</strong> 底池 /{' '}
                <strong className="text-white">50%</strong> 预售
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#FE810B]" />
              <span>
                认购总量上限：<strong className="text-white">5 亿枚</strong> (超卖自动拦截)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#FE810B]" />
              <span>
                流动性 LP：开盘自动注入并<strong className="text-white">永久死锁 (0xdead)</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#FE810B]" />
              <span>
                交易税费：开盘加池完成后<strong className="text-white">免税窗口结束瞬间启动</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-10 p-4">
          {/* 第 1 节：预售定价与单人认购限额 */}
          <div className="flex flex-col gap-6">
            <SectionHeader
              title="预售定价与认购限额"
              required
              badge="预售总份额 50% (5亿枚)"
            />

            {/* 预售代币价格 */}
            <form.Field
              name="presaleTokenPrice"
              validators={{
                onChange: ({ value }) => {
                  const n = Number(value)
                  if (!value || Number.isNaN(n) || n <= 0) {
                    return '预售单价必须大于 0'
                  }
                  return undefined
                },
              }}
            >
              {(field) => {
                const errorMsg = field.state.meta.errors[0]
                const priceNum = Number(field.state.value)
                const expectedTotalBnb =
                  !Number.isNaN(priceNum) && priceNum > 0
                    ? (priceNum * 500000000).toLocaleString('zh-CN', {
                        maximumFractionDigits: 4,
                      })
                    : '--'

                return (
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-0.5">
                        <label
                          htmlFor={field.name}
                          className="text-sm text-white"
                        >
                          预售代币价格 (BNB / 枚)
                        </label>
                        <span className="text-xs text-[#f7594b]">*</span>
                      </div>
                      <span className="text-xs text-[#FFA546]">
                        全额售罄预计募集: {expectedTotalBnb} BNB
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <NumericInput
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        title="设置预售代币价格"
                        description="每 1 枚代币的 BNB 价格，散户按此汇率认购代币"
                        unit="BNB/枚"
                        allowDecimal
                        maxDecimals={9}
                        presets={[
                          { label: '0.0000005', value: '0.0000005' },
                          { label: '0.000001', value: '0.000001' },
                          { label: '0.000005', value: '0.000005' },
                          { label: '0.00001', value: '0.00001' },
                          { label: '0.0001', value: '0.0001' },
                        ]}
                      />
                    </div>
                    {errorMsg && (
                      <p className="mt-1 text-xs text-red-500">{errorMsg}</p>
                    )}
                    <p className="mt-1.5 text-xs text-neutral-400">
                      例如设为 0.000001 BNB/枚时，用户支付 1 BNB 可认购 100 万枚代币。
                    </p>
                  </div>
                )
              }}
            </form.Field>

            {/* 单钱包认购上限 */}
            <form.Field
              name="maxBuyPerWallet"
              validators={{
                onChange: ({ value }) => {
                  const n = Number(value)
                  if (!value || Number.isNaN(n) || n <= 0) {
                    return '单钱包认购上限必须大于 0'
                  }
                  if (n > 500000000) {
                    return '认购上限不能超过预售总份额 5 亿枚'
                  }
                  return undefined
                },
              }}
            >
              {(field) => {
                const errorMsg = field.state.meta.errors[0]
                const valNum = Number(field.state.value)
                const percentOfPresale =
                  !Number.isNaN(valNum) && valNum > 0
                    ? ((valNum / 500000000) * 100).toFixed(1)
                    : '0'

                return (
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-0.5">
                        <label
                          htmlFor={field.name}
                          className="text-sm text-white"
                        >
                          单钱包认购上限 (代币数量)
                        </label>
                        <span className="text-xs text-[#f7594b]">*</span>
                      </div>
                      <span className="text-xs text-neutral-400">
                        占预售总额 {percentOfPresale}%
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <NumericInput
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        title="设置单钱包认购上限"
                        description="防止单一巨鲸垄断预售份额，上限最多 5 亿枚"
                        unit="枚"
                        min={1}
                        max={500000000}
                        presets={[
                          { label: '1000万', value: '10000000' },
                          { label: '5000万', value: '50000000' },
                          { label: '1亿 (默认)', value: '100000000' },
                          { label: '2.5亿', value: '250000000' },
                          { label: '5亿 (不限)', value: '500000000' },
                        ]}
                      />
                    </div>
                    {errorMsg && (
                      <p className="mt-1 text-xs text-red-500">{errorMsg}</p>
                    )}
                    <p className="mt-1.5 text-xs text-neutral-400">
                      每个钱包地址最多可认购的代币上限，为 0 时会导致认购失败。
                    </p>
                  </div>
                )
              }}
            </form.Field>
          </div>

          {/* 第 2 节：募资目标与流动性软硬顶 */}
          <div className="flex flex-col gap-6">
            <SectionHeader title="募资目标与流动性底池" required />

            <div className="grid grid-cols-2 gap-4">
              {/* 认购成功软顶 (softCap) */}
              <form.Field
                name="softCap"
                validators={{
                  onChange: ({ value }) => {
                    const n = Number(value)
                    if (!value || Number.isNaN(n) || n <= 0) {
                      return '认购软顶必须大于 0'
                    }
                    return undefined
                  },
                }}
              >
                {(field) => {
                  const errorMsg = field.state.meta.errors[0]
                  return (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-0.5">
                        <label
                          htmlFor={field.name}
                          className="text-sm text-white"
                        >
                          认购软顶 (SoftCap)
                        </label>
                        <span className="text-xs text-[#f7594b]">*</span>
                      </div>
                      <div className="mt-1.5">
                        <NumericInput
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          title="设置预售成功软顶 (BNB)"
                          description="认购期结束时若未达此金额，预售失败并开放散户全额退款"
                          unit="BNB"
                          allowDecimal
                          maxDecimals={4}
                          presets={[
                            { label: '0.5 BNB', value: '0.5' },
                            { label: '1 BNB', value: '1' },
                            { label: '5 BNB', value: '5' },
                            { label: '10 BNB', value: '10' },
                            { label: '50 BNB', value: '50' },
                          ]}
                        />
                      </div>
                      {errorMsg && (
                        <p className="mt-1 text-xs text-red-500">{errorMsg}</p>
                      )}
                    </div>
                  )
                }}
              </form.Field>

              {/* 加池最低 BNB (minLiquidityAmount) */}
              <form.Field
                name="minLiquidityAmount"
                validators={{
                  onChange: ({ value }) => {
                    const n = Number(value)
                    if (!value || Number.isNaN(n) || n <= 0) {
                      return '加池最低 BNB 必须大于 0'
                    }
                    return undefined
                  },
                }}
              >
                {(field) => {
                  const errorMsg = field.state.meta.errors[0]
                  return (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-0.5">
                        <label
                          htmlFor={field.name}
                          className="text-sm text-white"
                        >
                          加池最低 BNB
                        </label>
                        <span className="text-xs text-[#f7594b]">*</span>
                      </div>
                      <div className="mt-1.5">
                        <NumericInput
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          title="设置加池最低 BNB 要求"
                          description="开盘注入流动性底池的最低资金门槛，必须 ≤ 认购软顶"
                          unit="BNB"
                          allowDecimal
                          maxDecimals={4}
                          presets={[
                            { label: '0.1 (默认)', value: '0.1' },
                            { label: '0.5 BNB', value: '0.5' },
                            { label: '1 BNB', value: '1' },
                            { label: '2 BNB', value: '2' },
                          ]}
                        />
                      </div>
                      {errorMsg && (
                        <p className="mt-1 text-xs text-red-500">{errorMsg}</p>
                      )}
                    </div>
                  )
                }}
              </form.Field>
            </div>

            {/* 募资硬顶 (hardcap) */}
            <form.Field
              name="hardcap"
              validators={{
                onChange: ({ value }) => {
                  const n = Number(value)
                  if (Number.isNaN(n) || n < 0) {
                    return '硬顶金额不能为负数'
                  }
                  return undefined
                },
              }}
            >
              {(field) => {
                const errorMsg = field.state.meta.errors[0]
                return (
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={field.name}
                        className="text-sm text-white"
                      >
                        募资硬顶 (HardCap) - 选填
                      </label>
                      <span className="text-xs text-neutral-400">
                        0 或留空表示不设上限
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <NumericInput
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        title="设置募资硬顶 (BNB)"
                        description="募集达到硬顶后认购提前结束，设为 0 表示不限制"
                        unit="BNB"
                        allowDecimal
                        maxDecimals={4}
                        presets={[
                          { label: '0 (不限)', value: '0' },
                          { label: '5 BNB', value: '5' },
                          { label: '10 BNB', value: '10' },
                          { label: '50 BNB', value: '50' },
                          { label: '100 BNB', value: '100' },
                        ]}
                      />
                    </div>
                    {errorMsg && (
                      <p className="mt-1 text-xs text-red-500">{errorMsg}</p>
                    )}
                    <p className="mt-1.5 text-xs text-neutral-400">
                      硬顶必须 ≥ 软顶。达到硬顶后任何新的认购交易将被合约自动拒绝。
                    </p>
                  </div>
                )
              }}
            </form.Field>
          </div>

          {/* 第 3 节：代币锁仓与线性释放 (Vesting) */}
          <div className="flex flex-col gap-6">
            <SectionHeader
              title="代币锁仓与释放 (Vesting)"
              required
              badge="恒开启保护机制"
            />
            <div className="rounded border border-[#2F3737] bg-[#17191b] p-3 text-xs text-neutral-300">
              <div className="flex items-center gap-1.5 font-semibold text-white">
                <Clock className="size-4 text-[#FE810B]" />
                <span>同节奏线性释放保护</span>
              </div>
              <p className="mt-1 text-neutral-400">
                开盘后，散户认购的 50% 份额、创建者的 30% 份额以及未售出的预售份额将按相同的周期和比例分批释放，防止开盘即抛砸盘。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* 释放周期 (vestingDelay) */}
              <form.Field
                name="vestingDelay"
                validators={{
                  onChange: ({ value }) => {
                    const n = Number(value)
                    if (!value || !Number.isInteger(n) || n < 7 || n > 90) {
                      return '释放周期须在 7 至 90 天之间'
                    }
                    return undefined
                  },
                }}
              >
                {(field) => {
                  const errorMsg = field.state.meta.errors[0]
                  return (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-0.5">
                        <label
                          htmlFor={field.name}
                          className="text-sm text-white"
                        >
                          释放周期长度
                        </label>
                        <span className="text-xs text-[#f7594b]">*</span>
                      </div>
                      <div className="mt-1.5">
                        <NumericInput
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          title="设置释放周期长度 (7-90 天)"
                          description="开盘后每过一个周期解锁一期代币份额"
                          unit="天"
                          min={7}
                          max={90}
                          presets={[
                            { label: '7天 (默认)', value: 7 },
                            { label: '14天', value: 14 },
                            { label: '30天', value: 30 },
                            { label: '60天', value: 60 },
                            { label: '90天', value: 90 },
                          ]}
                        />
                      </div>
                      {errorMsg && (
                        <p className="mt-1 text-xs text-red-500">{errorMsg}</p>
                      )}
                    </div>
                  )
                }}
              </form.Field>

              {/* 每期释放比例 (vestingRate) */}
              <form.Field
                name="vestingRate"
                validators={{
                  onChange: ({ value }) => {
                    const n = Number(value)
                    if (!value || !Number.isInteger(n) || n < 5 || n > 20) {
                      return '释放比例须在 5% 至 20% 之间'
                    }
                    return undefined
                  },
                }}
              >
                {(field) => {
                  const errorMsg = field.state.meta.errors[0]
                  return (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-0.5">
                        <label
                          htmlFor={field.name}
                          className="text-sm text-white"
                        >
                          每期释放比例
                        </label>
                        <span className="text-xs text-[#f7594b]">*</span>
                      </div>
                      <div className="mt-1.5">
                        <NumericInput
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          title="设置每期释放比例 (5%-20%)"
                          description="每个周期解锁的份额百分比，如 10% 代表共 10 期放完"
                          unit="%"
                          min={5}
                          max={20}
                          presets={[
                            { label: '5% (20期)', value: 5 },
                            { label: '10% (10期)', value: 10 },
                            { label: '15% (7期)', value: 15 },
                            { label: '20% (5期)', value: 20 },
                          ]}
                        />
                      </div>
                      {errorMsg && (
                        <p className="mt-1 text-xs text-red-500">{errorMsg}</p>
                      )}
                    </div>
                  )
                }}
              </form.Field>
            </div>

            {/* 联动释放节奏推算提示 */}
            <form.Subscribe
              selector={(state) => ({
                delay: Number(state.values.vestingDelay) || 7,
                rate: Number(state.values.vestingRate) || 10,
              })}
            >
              {({ delay, rate }) => {
                const totalPeriods = Math.ceil(100 / Math.max(rate, 1))
                const totalDays = totalPeriods * delay
                return (
                  <p className="text-xs text-neutral-400">
                    当前配置：共分{' '}
                    <strong className="text-[#FFA546]">{totalPeriods} 期</strong> 释放，每{' '}
                    <strong className="text-[#FFA546]">{delay} 天</strong> 释放 {rate}%，约{' '}
                    <strong className="text-white">{totalDays} 天</strong>（约{' '}
                    {(totalDays / 30).toFixed(1)} 个月）全部释放完毕。
                  </p>
                )
              }}
            </form.Subscribe>
          </div>

          {/* 第 4 节：高级与安全保护设置 */}
          <div className="flex flex-col gap-6">
            <SectionHeader title="加池滑点与开启时间" />

            <div className="grid grid-cols-2 gap-4">
              {/* 加池滑点保护 (slippage) */}
              <form.Field
                name="slippage"
                validators={{
                  onChange: ({ value }) => {
                    const n = Number(value)
                    if (Number.isNaN(n) || n < 0 || n > 10) {
                      return '加池滑点须在 0% 至 10% 之间'
                    }
                    return undefined
                  },
                }}
              >
                {(field) => {
                  const errorMsg = field.state.meta.errors[0]
                  return (
                    <div className="flex flex-col">
                      <label
                        htmlFor={field.name}
                        className="text-sm text-white"
                      >
                        加池滑点保护
                      </label>
                      <div className="mt-1.5">
                        <NumericInput
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          title="设置加池滑点保护 (0-10%)"
                          description="开盘注入底池时的滑点容忍度，填 0 保持默认 5% (500 bps)"
                          unit="%"
                          min={0}
                          max={10}
                          allowDecimal
                          maxDecimals={1}
                          presets={[
                            { label: '0% (默认5%)', value: 0 },
                            { label: '3%', value: 3 },
                            { label: '5%', value: 5 },
                            { label: '8%', value: 8 },
                            { label: '10%', value: 10 },
                          ]}
                        />
                      </div>
                      {errorMsg && (
                        <p className="mt-1 text-xs text-red-500">{errorMsg}</p>
                      )}
                    </div>
                  )
                }}
              </form.Field>

              {/* 预售开启时间类型 */}
              <form.Field name="startTimeType">
                {(field) => (
                  <div className="flex flex-col">
                    <label className="text-sm text-white">预售开始时间</label>
                    <div className="mt-1.5 flex h-10.5 items-center rounded-xs border border-[#84888c] bg-transparent p-1">
                      <button
                        type="button"
                        onClick={() => field.handleChange('immediate')}
                        className={`flex-1 rounded-xs py-1.5 text-xs font-semibold transition-all ${
                          field.state.value === 'immediate'
                            ? 'bg-[#FE810B] text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        立即开启 (0)
                      </button>
                      <button
                        type="button"
                        onClick={() => field.handleChange('custom')}
                        className={`flex-1 rounded-xs py-1.5 text-xs font-semibold transition-all ${
                          field.state.value === 'custom'
                            ? 'bg-[#FE810B] text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        指定时间
                      </button>
                    </div>
                  </div>
                )}
              </form.Field>
            </div>

            {/* 指定具体未来时间输入 */}
            <form.Subscribe selector={(state) => state.values.startTimeType}>
              {(startTimeType) =>
                startTimeType === 'custom' ? (
                  <form.Field name="startTime">
                    {(field) => (
                      <div className="flex flex-col">
                        <label
                          htmlFor={field.name}
                          className="text-sm text-white"
                        >
                          指定认购开始时间
                        </label>
                        <input
                          id={field.name}
                          name={field.name}
                          type="datetime-local"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          className="mt-1.5 h-10.5 w-full rounded-xs border border-[#84888c] bg-transparent px-3 text-sm text-white focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B]"
                        />
                        <p className="mt-1 text-xs text-neutral-400">
                          指定时间到达前，散户将无法进行认购。
                        </p>
                      </div>
                    )}
                  </form.Field>
                ) : null
              }
            </form.Subscribe>
          </div>

          {/* 第 5 节：创建者防抢跑代币购买 (Creator Buy) */}
          <div className="flex flex-col gap-6">
            <SectionHeader
              title="创建者代币购买 (防抢跑注资)"
              badge="可选机制"
            />

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
              <div className="flex items-center gap-1.5 font-bold text-amber-200">
                <ShieldCheck className="size-4 shrink-0 text-amber-400" />
                <span>防抢跑免税窗口购买说明</span>
              </div>
              <p className="mt-1 text-neutral-300">
                开盘加池后、税费启动前的原子免税窗口内，合约自动为创建者买入指定代币。买入代币<strong className="text-white">不锁仓即时全额到账</strong>，有效防止抢跑套利。开盘前可随时撤回注资金额。
              </p>
            </div>

            {/* 购买模式选择 */}
            <form.Field name="creatorBuyMode">
              {(field) => (
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-white">选择购买方式</span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'none', label: '不参与购买', desc: '不注资' },
                      {
                        id: 'quote',
                        label: '按金额买入',
                        desc: 'Quote 模式 (随行就市)',
                      },
                      {
                        id: 'token',
                        label: '按数量买入',
                        desc: 'Token 模式 (精确购买)',
                      },
                    ].map((mode) => {
                      const active = field.state.value === mode.id
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() =>
                            field.handleChange(
                              mode.id as 'none' | 'quote' | 'token',
                            )
                          }
                          className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all ${
                            active
                              ? 'border-[#FE810B] bg-[#FE810B]/15 text-white'
                              : 'border-[#2F3737] bg-[#17191b] text-neutral-400 hover:border-neutral-600'
                          }`}
                        >
                          <span className="text-xs font-bold">{mode.label}</span>
                          <span className="mt-0.5 text-xs text-neutral-500">
                            {mode.desc}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </form.Field>

            {/* 购买参数动态表单 */}
            <form.Subscribe selector={(state) => state.values.creatorBuyMode}>
              {(mode) => {
                if (mode === 'none') return null

                return (
                  <div className="flex flex-col gap-4 rounded-lg border border-[#2F3737] bg-[#17191b] p-4">
                    {mode === 'token' && (
                      <form.Field
                        name="creatorBuyTokens"
                        validators={{
                          onChange: ({ value }) => {
                            const n = Number(value)
                            if (!value || Number.isNaN(n) || n <= 0) {
                              return '请输入要购买的代币数量'
                            }
                            if (n > 50000000) {
                              return '购买上限为底池份额的 25% (最多 50,000,000 枚)'
                            }
                            return undefined
                          },
                        }}
                      >
                        {(field) => {
                          const errorMsg = field.state.meta.errors[0]
                          return (
                            <div className="flex flex-col">
                              <div className="flex items-center justify-between">
                                <label
                                  htmlFor={field.name}
                                  className="text-sm text-white"
                                >
                                  目标购买代币数量 (上限 5000 万枚)
                                </label>
                                <span className="text-xs text-neutral-400">
                                  最多 5000 万枚 (25% 底池)
                                </span>
                              </div>
                              <div className="mt-1.5">
                                <NumericInput
                                  id={field.name}
                                  name={field.name}
                                  value={field.state.value}
                                  onChange={field.handleChange}
                                  onBlur={field.handleBlur}
                                  title="设置买入目标代币数量"
                                  description="开盘时精确买入的代币枚数，上限 5000 万枚"
                                  unit="枚"
                                  min={1}
                                  max={50000000}
                                  presets={[
                                    { label: '500万', value: '5000000' },
                                    { label: '1000万', value: '10000000' },
                                    { label: '2000万', value: '20000000' },
                                    { label: '5000万 (上限)', value: '50000000' },
                                  ]}
                                />
                              </div>
                              {errorMsg && (
                                <p className="mt-1 text-xs text-red-500">
                                  {errorMsg}
                                </p>
                              )}
                            </div>
                          )
                        }}
                      </form.Field>
                    )}

                    <form.Field
                      name="creatorBuyBnb"
                      validators={{
                        onChange: ({ value }) => {
                          const n = Number(value)
                          if (!value || Number.isNaN(n) || n <= 0) {
                            return '注资金额必须大于 0'
                          }
                          return undefined
                        },
                      }}
                    >
                      {(field) => {
                        const errorMsg = field.state.meta.errors[0]
                        return (
                          <div className="flex flex-col">
                            <div className="flex items-center justify-between">
                              <label
                                htmlFor={field.name}
                                className="text-sm text-white"
                              >
                                {mode === 'token'
                                  ? '注资 BNB 资金池 (成本估算+缓冲)'
                                  : '随行就市买入的 BNB 金额'}
                              </label>
                              <span className="text-xs text-neutral-400">
                                未消耗部分将自动退还
                              </span>
                            </div>
                            <div className="mt-1.5">
                              <NumericInput
                                id={field.name}
                                name={field.name}
                                value={field.state.value}
                                onChange={field.handleChange}
                                onBlur={field.handleBlur}
                                title="设置创建者买入注资金额 (BNB)"
                                description="开盘结算后超额的 BNB 资金将自动原路退还至您的钱包"
                                unit="BNB"
                                allowDecimal
                                maxDecimals={4}
                                presets={[
                                  { label: '0.1 BNB', value: '0.1' },
                                  { label: '0.3 BNB', value: '0.3' },
                                  { label: '0.5 BNB', value: '0.5' },
                                  { label: '1 BNB', value: '1' },
                                  { label: '2 BNB', value: '2' },
                                ]}
                              />
                            </div>
                            {errorMsg && (
                              <p className="mt-1 text-xs text-red-500">
                                {errorMsg}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-neutral-400">
                              此资金将在创建预售时作为附加资金 (msg.value) 注入预售合约，开盘未花完部分自动原路退回。
                            </p>
                          </div>
                        )
                      }}
                    </form.Field>
                  </div>
                )
              }}
            </form.Subscribe>
          </div>
        </div>
      </div>

      {/* 底部提交操作栏 */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-t-white/10 bg-[#131516] p-4">
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.isValid && !state.isSubmitting && Boolean(address),
            isSubmitting: state.isSubmitting,
            creatorBuyBnb: state.values.creatorBuyBnb,
            creatorBuyMode: state.values.creatorBuyMode,
          })}
        >
          {({ canSubmit, isSubmitting, creatorBuyBnb, creatorBuyMode }) => {
            const requiredBnb =
              creatorBuyMode !== 'none' && Number(creatorBuyBnb) > 0
                ? `${creatorBuyBnb} BNB`
                : '0 BNB'

            return (
              <div className="flex flex-col gap-2">
                {submitError && (
                  <p className="text-xs font-medium text-red-500">
                    {submitError}
                  </p>
                )}

                {isSuccess && (
                  <div className="rounded border border-green-500/30 bg-green-500/10 p-3 text-xs text-green-400">
                    <p className="font-semibold">
                      🎉 预售配置已成功保存！
                    </p>
                    <div className="mt-1 flex items-center justify-between">
                      <span>您可以前往控制台查看代币预售状态。</span>
                      <Link
                        to="/dashboard"
                        className="font-bold underline hover:text-white"
                      >
                        返回控制台
                      </Link>
                    </div>
                  </div>
                )}

                {!address && (
                  <p className="text-xs text-neutral-400">
                    请先连接钱包后再开启预售
                  </p>
                )}

                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>本次预售注资需求：</span>
                  <span className="font-bold text-[#FFA546]">
                    {requiredBnb} (防抢跑购买) + Gas
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit || isSuccess}
                  className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/60 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-base font-bold text-white shadow-[0_3px_0_0_#963000] transition-transform active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFA546]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-5 animate-spin" />
                      <span>正在签名并配置预售…</span>
                    </>
                  ) : isSuccess ? (
                    <span>预售配置完成</span>
                  ) : (
                    <>
                      <Rocket className="size-5" />
                      <span>确认并开启预售</span>
                    </>
                  )}
                </button>
              </div>
            )
          }}
        </form.Subscribe>
      </div>
    </form>
  )
}
