import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useConfig, useReadContract } from 'wagmi'
import { writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { parseEther, formatEther, isAddress, type Hex } from 'viem'
import {
  hoursToSeconds,
  minutesToSeconds,
  secondsToHours,
  secondsToMinutes,
} from 'date-fns'
import { Calculator, Coins } from 'lucide-react'
import { Web3ActionButton } from '@/components/common/web3-action-button'

import { FormSectionTitle } from '@/components/common/form-section-title'
import { NumericInput } from '@/components/common/numeric-keypad'
import { TaxSlider } from '@/components/common/tax-slider'
import { toast } from '@/components/ui/toast'
import { updateTokenInfo, type TokenDetail } from '@/api/token'
import { requestAuthSignature } from '@/api/auth'
import { CreatorBuySection } from '@/components/presale/creator-buy-section'
import { StartTimePicker } from '@/components/presale/start-time-picker'
import { DEFAULT_CHAIN_ID, getContractAddresses } from '@/config/network'
import { CoordinatorFactoryAbi, FlapTaxTokenV3Abi } from '@/contracts/abi'
import { parseContractError } from '@/lib/contract-error'
import { useLocale } from '@/lib/i18n'
import { formatTokenSupply } from '@/lib/format'
import { cn } from '@/lib/utils'

/** 天 → 秒（date-fns v4 无 daysToSeconds，经小时换算） */
const daysToSeconds = (days: number) => hoursToSeconds(days * 24)

/** 认购时长单位 → 秒（date-fns 换算；合约约束：1 分钟 ~ 30 天，违规 revert InvalidDuration） */
const DURATION_UNITS = {
  分钟: minutesToSeconds,
  小时: hoursToSeconds,
  天: daysToSeconds,
} as const
type DurationUnit = keyof typeof DURATION_UNITS
const DURATION_MIN_SEC = minutesToSeconds(1)
const DURATION_MAX_SEC = daysToSeconds(30)
/** NumericInput 在各时长单位下的上限 */
const DURATION_UNIT_MAX: Record<DurationUnit, number> = {
  分钟: secondsToMinutes(DURATION_MAX_SEC),
  小时: secondsToHours(DURATION_MAX_SEC),
  天: 30,
}

interface PresaleFormProps {
  token?: TokenDetail | null
  tokenAddress: string
  address: `0x${string}`
}

export function PresaleForm({
  token,
  tokenAddress,
  address,
}: PresaleFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const config = useConfig()
  const { locale } = useLocale()

  const resolvedTokenAddress = tokenAddress || token?.coinContractAddress || ''

  // 读取代币链上总量，按 50% 计算 presaleShare
  const { data: totalSupplyData } = useReadContract({
    address: resolvedTokenAddress ? (resolvedTokenAddress as Hex) : undefined,
    abi: FlapTaxTokenV3Abi,
    functionName: 'totalSupply',
    chainId: DEFAULT_CHAIN_ID,
    query: {
      enabled: Boolean(resolvedTokenAddress),
      staleTime: Infinity,
    },
  })

  const totalSupply = (totalSupplyData as bigint | undefined) ?? 0n
  const totalSupplyNum = Number(formatEther(totalSupply))
  const totalSupplyText =
    totalSupply > 0n ? formatTokenSupply(totalSupply, locale) : '--'
  const presaleShare = totalSupply / 2n
  const presaleShareNum = Number(formatEther(presaleShare))
  const presaleShareText =
    presaleShare > 0n ? formatTokenSupply(presaleShare, locale) : '--'

  // 预售价自动计算公式：目标募资额 (hardcap) / presaleShare (50% * 总量)
  const calculatePriceBnb = (hardcapStr: string): string => {
    const num = Number(hardcapStr)
    if (!hardcapStr || Number.isNaN(num) || num <= 0 || presaleShare <= 0n) {
      return ''
    }
    const hardcapWei = parseEther(hardcapStr)
    const priceWei = (hardcapWei * 10n ** 18n) / presaleShare
    return priceWei > 0n ? formatEther(priceWei) : ''
  }

  const initialHardcap = token?.hardcap ? String(token.hardcap) : ''
  const initialSoftcap =
    token?.softcap || token?.soft ? String(token.softcap || token.soft) : ''

  const initialMaxBuyPercent = (() => {
    if (token?.maxBuyPerWallet && presaleShareNum > 0) {
      const p = Math.round((Number(token.maxBuyPerWallet) / presaleShareNum) * 100)
      if (p >= 2 && p <= 5) return p
    }
    return 2
  })()

  const form = useForm({
    defaultValues: {
      presaleTokenPrice: initialHardcap
        ? calculatePriceBnb(initialHardcap)
        : token?.presaleTokenPrice
          ? String(token.presaleTokenPrice)
          : '',
      maxBuyPercent: initialMaxBuyPercent,
      hardcap: initialHardcap,
      softcap: initialSoftcap,
      vestingDelay: token?.vestingDelay ? String(token.vestingDelay) : '7',
      vestingRate: token?.vestingRate ? Number(token.vestingRate) : 5,
      creatorBuyTokens: token?.creatorBuyTokens
        ? String(token.creatorBuyTokens)
        : '0',
      creatorBuyBnb: token?.creatorBuyBnb ? String(token.creatorBuyBnb) : '',
      startTime: '0',
      durationValue: '30',
      durationUnit: '分钟',
    },
    onSubmit: async ({ value }) => {
      const hardcapNum = Number(value.hardcap || '0')
      const softcapNum = Number((hardcapNum * 0.5).toFixed(4))
      const hardcapWei = parseEther(value.hardcap || '0')
      const softcapWei = parseEther(String(softcapNum))
      const minLiquidityWei = softcapWei // 自动对齐软顶

      // 预售价公式：目标募资额 / presaleShare (50% * 总量)
      const priceWei =
        presaleShare > 0n && hardcapWei > 0n
          ? (hardcapWei * 10n ** 18n) / presaleShare
          : parseEther(value.presaleTokenPrice || '0.001')
      const priceBNB = formatEther(priceWei)

      // 单钱包限购：
      // 直觉口径：单钱包最多认购 X_BNB（占硬顶比例 percent）
      // 换算代币数：maxBuyPerWallet = X_BNB / presaleTokenPrice 
      //            = (hardcap * percent / 100) / (hardcap / presaleShare) 
      //            = presaleShare * percent / 100
      // 优先直接使用 presaleShare 比例计算，避免除以单价产生浮点与除法截断误差，确保代币数量永远为整币
      const percent = BigInt(Number(value.maxBuyPercent || 2))
      const maxBuyWei =
        presaleShare > 0n
          ? (presaleShare * percent) / 100n
          : priceWei > 0n
            ? (((hardcapWei * percent) / 100n) * 10n ** 18n) / priceWei
            : 0n
      const maxBuyTokensStr = formatEther(maxBuyWei)

      // 测试网环境：无论 UI 输入多少，接口与合约统一固定传入 5 分钟 (300 秒)
      const FIXED_VESTING_DELAY_SEC = 300
      const vestingDelaySec = BigInt(FIXED_VESTING_DELAY_SEC)

      // 认购时长（秒）：1 分钟 ~ 30 天，默认 30 分钟
      const durationSec = Math.round(
        (DURATION_UNITS[(value.durationUnit || '分钟') as DurationUnit] ??
          minutesToSeconds)(Number(value.durationValue || '0')),
      )
      if (durationSec < DURATION_MIN_SEC || durationSec > DURATION_MAX_SEC) {
        toast.error('认购时长须在 1 分钟至 30 天之间')
        return
      }

      // 开始时间：0 = 立即（链上语义）；后端与链上保持同口径传 0，
      // 真实结束时间由后端解析 openPresale 交易后按链上 endTime 为准
      const pickedStartSec = Number(value.startTime) || 0

      const creatorBuyTokensWei = parseEther(value.creatorBuyTokens || '0')
      let creatorBuyBnbWei = parseEther(value.creatorBuyBnb || '0')

      // 代币模式自动补齐注资
      if (creatorBuyTokensWei > 0n && creatorBuyBnbWei <= 0n) {
        creatorBuyBnbWei =
          (creatorBuyTokensWei * priceWei) / 1000000000000000000n
      }

      // 校验创建者注资是否超过单钱包上限
      const creatorBuyBnbNum = Number(formatEther(creatorBuyBnbWei))
      const maxBuyPercentNum = Number(value.maxBuyPercent || 2)
      const maxBuyBnbAllowed = hardcapNum * (maxBuyPercentNum / 100)
      if (maxBuyBnbAllowed > 0 && creatorBuyBnbNum > maxBuyBnbAllowed + 0.0001) {
        toast.error(
          `创建者注资不能超过单钱包购买上限（${maxBuyBnbAllowed.toFixed(4)} BNB）`,
        )
        return
      }

      try {
        if (!resolvedTokenAddress || !isAddress(resolvedTokenAddress)) {
          toast.error('未找到有效的代币合约地址，请先在控制台完成代币发行')
          return
        }

        const coordinator =
          getContractAddresses(DEFAULT_CHAIN_ID).coordinatorFactory

        // ① 先获取钱包签名鉴权
        const auth = await requestAuthSignature(config, address)

        // ② 链上调用 coordinator.setupPresale（一次性配置 + 购买注资）
        const setupHash = await writeContract(config, {
          address: coordinator,
          abi: CoordinatorFactoryAbi,
          functionName: 'setupPresale',
          account: address,
          chainId: DEFAULT_CHAIN_ID,
          args: [
            resolvedTokenAddress as Hex,
            {
              presaleTokenPrice: priceWei,
              maxBuyPerWallet: maxBuyWei,
              hardcap: hardcapWei,
              minLiquidityAmount: minLiquidityWei,
              softCap: softcapWei,
              startTime: BigInt(pickedStartSec),
              duration: BigInt(durationSec),
              vestingDelay: vestingDelaySec,
              vestingRate: BigInt(Number(value.vestingRate || 5)),
              slippage: 0n,
              creatorBuyTokens: creatorBuyTokensWei,
            },
          ],
          value: creatorBuyBnbWei > 0n ? creatorBuyBnbWei : undefined,
        })
        await waitForTransactionReceipt(config, {
          hash: setupHash,
          chainId: DEFAULT_CHAIN_ID,
        })

        // ③ 同步预售信息到后端数据库
        await updateTokenInfo({
          id: token?.id ?? '',
          name: token?.name ?? '',
          coinImg: token?.coinImg ?? '',
          symbol: token?.symbol ?? '',
          meta: token?.meta || token?.zhIntroduction || '',
          buyTax: token?.buyTax ?? 0,
          sellTax: token?.sellTax ?? 0,
          feeRecipient: token?.feeRecipient || address,
          taxDuration: Number(token?.taxDuration) || 30,
          antiFarmerDuration: Number(token?.antiFarmerDuration) || 0,
          liqExpectedOutputAmount: 0,
          launchType: token?.launchType || 2,
          website: token?.website ?? '',
          telegram: token?.telegram ?? '',
          twitter: token?.twitter ?? '',
          // 预售参数
          presaleTokenPrice: priceBNB,
          maxBuyPerWallet: maxBuyTokensStr,
          hardcap: value.hardcap,
          softcap: String(softcapNum),
          minLiquidityAmount: String(softcapNum),
          startTime: pickedStartSec,
          endTime: pickedStartSec > 0 ? pickedStartSec + durationSec : 0,
          vestingDelay: FIXED_VESTING_DELAY_SEC,
          vestingRate: Number(value.vestingRate) || 5,
          slippage: 0,
          creatorBuyTokens: value.creatorBuyTokens || '0',
          creatorBuyBnb: value.creatorBuyBnb || '0',
          ...auth,
        })

        toast.success('预售条款已成功配置上链！前往控制台开启认购')
        queryClient.invalidateQueries({ queryKey: ['creatorTokens', address] })
        navigate('/dashboard')
      } catch (err: unknown) {
        toast.error(parseContractError(err), '配置失败')
      }
    },
  })

  // 当链上读取到代币总量后，若当前已填入硬顶，自动同步预售单价
  useEffect(() => {
    const currentHardcap = form.getFieldValue('hardcap')
    if (currentHardcap && presaleShare > 0n && !form.getFieldValue('presaleTokenPrice')) {
      form.setFieldValue('presaleTokenPrice', calculatePriceBnb(currentHardcap))
    }
  }, [presaleShare])

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="flex flex-col gap-4">
        <FormSectionTitle title="认购参数" required />

        <form.Field
          name="hardcap"
          validators={{
            onChange: ({ value }) => {
              const n = Number(value)
              if (!value || Number.isNaN(n) || n <= 0)
                return '请输入大于 0 的硬顶金额'
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap label="硬顶" required error={field.state.meta.errors[0]}>
              <NumericInput
                id={field.name}
                name={field.name}
                placeholder=""
                value={field.state.value}
                onChange={(val) => {
                  field.handleChange(val)
                  const num = Number(val)
                  if (val && !Number.isNaN(num) && num > 0) {
                    form.setFieldValue(
                      'presaleTokenPrice',
                      calculatePriceBnb(val),
                    )
                  } else {
                    form.setFieldValue('presaleTokenPrice', '')
                  }
                }}
                onBlur={field.handleBlur}
                title="设置募资硬顶 (BNB)"
                description="募集达到硬顶后认购提前结束；软顶需在下方手动设置为硬顶的 50%"
                unit="BNB"
                allowDecimal
                maxDecimals={4}
              />
            </FieldWrap>
          )}
        </form.Field>

        <form.Field
          name="softcap"
          validators={{
            onChangeListenTo: ['hardcap'],
            onChange: ({ value, fieldApi }) => {
              const n = Number(value)
              if (!value || Number.isNaN(n) || n <= 0)
                return '请输入大于 0 的软顶金额'
              const hardcap = Number(fieldApi.form.getFieldValue('hardcap'))
              if (!Number.isFinite(hardcap) || hardcap <= 0)
                return '请先输入有效的硬顶金额'
              const expected = Number((hardcap * 0.5).toFixed(4))
              if (Math.abs(n - expected) > 0.0001)
                return `软顶必须是硬顶的 50%（当前硬顶 ${hardcap} BNB，软顶应为 ${expected} BNB）`
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap label="软顶" required error={field.state.meta.errors[0]}>
              <NumericInput
                id={field.name}
                name={field.name}
                placeholder=""
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                title="设置预售成功软顶 (BNB)"
                description="需设置为硬顶的 50%（例如硬顶 100 BNB 时软顶填 50 BNB）。认购结束时达到软顶即可加池开盘，未达软顶则全额退款"
                unit="BNB"
                allowDecimal
                maxDecimals={4}
              />
            </FieldWrap>
          )}
        </form.Field>

        {/* <div className="flex items-start gap-2 border border-[#2F3737] bg-[#181a1d] p-2.5 text-[11px] text-neutral-400">
          <Info className="mt-0.5 size-3.5 shrink-0 text-neutral-500" />
          <span>
            认购结束时若募集金额达到软顶，即可一键加池开盘；若未达软顶则预售失败，认购者全额原路退款。
          </span>
        </div> */}

        <form.Field
          name="maxBuyPercent"
          validators={{
            onChange: ({ value }) => {
              const n = Number(value)
              if (!Number.isInteger(n) || n < 2 || n > 5)
                return '单钱包限额比例须为 2% 至 5% 之间的整数'
              return undefined
            },
          }}
        >
          {(field) => (
            <div className="flex flex-col">
              <TaxSlider
                id={field.name}
                label="单钱包认购上限"
                required
                min={2}
                max={5}
                step={1}
                value={Number(field.state.value) || 2}
                onChange={field.handleChange}
              />
              <form.Subscribe
                selector={(state) => ({
                  hardcap: state.values.hardcap,
                  percent: state.values.maxBuyPercent,
                })}
              >
                {({ hardcap, percent }) => {
                  const hardcapNum = Number(hardcap)
                  const hasValidHardcap =
                    Boolean(hardcap) &&
                    !Number.isNaN(hardcapNum) &&
                    hardcapNum > 0

                  const p = hasValidHardcap ? Number(percent || 2) : 0
                  const maxBnb = hasValidHardcap
                    ? Number((hardcapNum * (p / 100)).toFixed(4))
                    : 0

                  return (
                    <span className="mt-2.5 text-xs text-neutral-400">
                      每个钱包最多出资 {maxBnb} BNB（占硬顶 {p}%）
                    </span>
                  )
                }}
              </form.Subscribe>
              {field.state.meta.errors[0] && (
                <p className="mt-1 text-xs text-red-500">
                  {typeof field.state.meta.errors[0] === 'string'
                    ? field.state.meta.errors[0]
                    : (field.state.meta.errors[0] as { message?: string })
                        ?.message}
                </p>
              )}
            </div>
          )}
        </form.Field>

        {/* 预售指标统一展示容器：发行总量、预售总量、预售单价（位于单钱包认购上限下方） */}
        <form.Subscribe
          selector={(state) => ({
            hardcap: state.values.hardcap,
            presaleTokenPrice: state.values.presaleTokenPrice,
          })}
        >
          {({ hardcap, presaleTokenPrice }) => {
            const calculatedPrice =
              presaleTokenPrice || (hardcap ? calculatePriceBnb(hardcap) : '')
            const hasPrice =
              Boolean(calculatedPrice) && Number(calculatedPrice) > 0

            return (
              <div className="flex flex-col divide-y divide-white/5 border border-[#2F3737] bg-[#181a1d] px-3.5 py-1 text-xs">
                {/* 发行总量 */}
                <div className="flex h-10 items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Coins className="size-3.5 shrink-0 text-[#FFA546]" />
                    <span className="text-xs font-medium leading-none text-neutral-200">
                      发行总量
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 text-right">
                    <span
                      className="font-mono text-base font-bold text-white"
                      title={
                        totalSupplyNum > 0
                          ? `${totalSupplyNum.toLocaleString()} ${token?.symbol || '代币'}`
                          : undefined
                      }
                    >
                      {totalSupplyText}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {token?.symbol || '代币'}
                    </span>
                  </div>
                </div>

                {/* 预售总量 */}
                <div className="flex h-10 items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Coins className="size-3.5 shrink-0 text-[#FFA546]" />
                    <span className="text-xs font-medium leading-none text-neutral-200">
                      预售总量
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 text-right">
                    <span
                      className="font-mono text-base font-bold text-white"
                      title={
                        presaleShareNum > 0
                          ? `${presaleShareNum.toLocaleString()} ${token?.symbol || '代币'}`
                          : undefined
                      }
                    >
                      {presaleShareText}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {token?.symbol || '代币'}
                    </span>
                  </div>
                </div>

                {/* 预售单价 */}
                <div className="flex h-10 items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="size-3.5 shrink-0 text-[#FFA546]" />
                    <span className="text-xs font-medium leading-none text-neutral-200">
                      预售单价
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 text-right">
                    <span className="font-mono text-base font-bold text-[#FFA546]">
                      {hasPrice ? calculatedPrice : '--'}
                    </span>
                    <span className="text-xs text-neutral-400">BNB</span>
                  </div>
                </div>
              </div>
            )
          }}
        </form.Subscribe>
      </div>

      <div className="flex flex-col gap-4">
        <FormSectionTitle title="认购时间" required />

        <form.Field name="startTime">
          {(field) => (
            <FieldWrap
              label="开始时间"
              required
              error={field.state.meta.errors[0]}
            >
              <StartTimePicker
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            </FieldWrap>
          )}
        </form.Field>

        <form.Field
          name="durationValue"
          validators={{
            onChangeListenTo: ['durationUnit'],
            onChange: ({ value, fieldApi }) => {
              const unit = (fieldApi.form.getFieldValue('durationUnit') ||
                '分钟') as DurationUnit
              const n = Number(value)
              if (!value || Number.isNaN(n) || n <= 0) return '请输入认购时长'
              const sec = (DURATION_UNITS[unit] ?? minutesToSeconds)(n)
              if (sec < DURATION_MIN_SEC || sec > DURATION_MAX_SEC)
                return '认购时长须在 1 分钟至 30 天之间'
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap
              label="认购时长"
              required
              error={field.state.meta.errors[0]}
            >
              <form.Subscribe
                selector={(state) =>
                  (state.values.durationUnit || '分钟') as DurationUnit
                }
              >
                {(unit) => (
                  <>
                    <NumericInput
                      id={field.name}
                      name={field.name}
                      placeholder=""
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      title="设置认购时长"
                      description="认购窗口自开始时间起持续多久，到期后可结束认购并加池"
                      unit={unit}
                      min={1}
                      max={DURATION_UNIT_MAX[unit]}
                      allowDecimal
                      maxDecimals={2}
                    />
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(Object.keys(DURATION_UNITS) as DurationUnit[]).map(
                        (u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() =>
                              form.setFieldValue('durationUnit', u)
                            }
                            className={cn(
                              'flex h-9 cursor-pointer items-center justify-center border text-xs font-semibold transition-all select-none',
                              unit === u
                                ? 'border-[#FE810B] bg-[#FE810B]/15 text-[#FFA546]'
                                : 'border-[#2F3737] bg-[#1a1c1e] text-neutral-300 hover:border-[#FE810B]/50 hover:text-white',
                            )}
                          >
                            {u}
                          </button>
                        ),
                      )}
                    </div>
                  </>
                )}
              </form.Subscribe>
            </FieldWrap>
          )}
        </form.Field>
      </div>

      <div className="flex flex-col gap-4">
        <FormSectionTitle title="锁仓释放" required />

        <form.Field
          name="vestingDelay"
          validators={{
            onChange: ({ value }) => {
              const n = Number(value)
              if (!value || !Number.isInteger(n) || n < 7 || n > 90)
                return '释放周期须在 7 至 90 天之间'
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap
              label="释放周期"
              required
              error={field.state.meta.errors[0]}
            >
              <NumericInput
                id={field.name}
                name={field.name}
                placeholder=""
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                title="设置释放周期 (7-90 天)"
                description="开盘后每过一个周期解锁一期代币份额"
                unit="天"
                min={7}
                max={90}
              />
            </FieldWrap>
          )}
        </form.Field>

        <form.Field
          name="vestingRate"
          validators={{
            onChange: ({ value }) => {
              if (![5, 10, 15, 20].includes(Number(value)))
                return '请选择 5%、10%、15% 或 20% 释放档位'
              return undefined
            },
          }}
        >
          {(field) => {
            const currentVal = Number(field.state.value) || 5
            return (
              <FieldWrap
                label="释放比例"
                required
                error={field.state.meta.errors[0]}
              >
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 15, 20].map((rate) => {
                    const isSelected = currentVal === rate
                    return (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => field.handleChange(rate)}
                        className={cn(
                          'flex h-10 cursor-pointer items-center justify-center border text-xs font-semibold transition-all select-none',
                          isSelected
                            ? 'border-[#FE810B] bg-[#FE810B]/15 text-[#FFA546]'
                            : 'border-[#2F3737] bg-[#1a1c1e] text-neutral-300 hover:border-[#FE810B]/50 hover:text-white',
                        )}
                      >
                        {rate}%
                      </button>
                    )
                  })}
                </div>
              </FieldWrap>
            )
          }}
        </form.Field>

        <form.Subscribe
          selector={(state) => ({
            rate: Number(state.values.vestingRate) || 5,
            delay: Number(state.values.vestingDelay) || 7,
          })}
        >
          {({ rate, delay }) => {
            const rounds = rate > 0 ? Math.ceil(100 / rate) : 0

            return (
              <div className="flex flex-col divide-y divide-white/5 border border-[#2F3737] bg-[#181a1d] px-4 py-3 text-xs">
                <div className="flex items-center justify-between pb-2.5">
                  <span className="text-neutral-400">释放轮数</span>
                  <span className="font-mono font-semibold text-white">
                    {rounds} 轮
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2.5">
                  <span className="text-neutral-400">每轮释放</span>
                  <span className="font-mono font-semibold text-white">
                    每 {delay} 天释放 {rate}%
                  </span>
                </div>
              </div>
            )
          }}
        </form.Subscribe>
      </div>

      <div className="flex flex-col gap-4">
          <form.Subscribe
            selector={(state) => ({
              creatorBuyBnb: state.values.creatorBuyBnb,
              creatorBuyTokens: state.values.creatorBuyTokens,
              presaleTokenPrice: state.values.presaleTokenPrice,
              hardcap: state.values.hardcap,
              maxBuyPercent: state.values.maxBuyPercent,
            })}
          >
          {({
            creatorBuyBnb,
            creatorBuyTokens,
            presaleTokenPrice,
            hardcap,
            maxBuyPercent,
          }) => {
            const hardcapNum = Number(hardcap || 0)
            const percent = Number(maxBuyPercent || 2)
            const maxBuyBnb =
              hardcapNum > 0
                ? Number((hardcapNum * (percent / 100)).toFixed(4))
                : 0

            return (
              <CreatorBuySection
                address={address}
                presaleTokenPrice={presaleTokenPrice}
                creatorBuyBnb={creatorBuyBnb}
                creatorBuyTokens={creatorBuyTokens}
                maxBuyBnb={maxBuyBnb}
                onChangeBnb={(val) => form.setFieldValue('creatorBuyBnb', val)}
                onChangeTokens={(val) =>
                  form.setFieldValue('creatorBuyTokens', val)
                }
              />
            )
          }}
        </form.Subscribe>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-t-white/10 bg-[#131516] p-4">
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.isValid && !state.isSubmitting,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Web3ActionButton
              type="submit"
              disabled={!canSubmit}
              loading={isSubmitting}
              loadingText="保存中…"
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-base font-bold text-white [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] transition-[transform,opacity] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFA546]"
            >
              <span>保存预售</span>
            </Web3ActionButton>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

interface FieldWrapProps {
  label: string
  required?: boolean
  error?: unknown
  labelClassName?: string
  children: ReactNode
}

function FieldWrap({
  label,
  required = false,
  error,
  labelClassName = 'text-sm text-white',
  children,
}: FieldWrapProps) {
  const errorText =
    typeof error === 'string'
      ? error
      : (error as { message?: string } | undefined)?.message
  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-center gap-0.5">
        <label className={labelClassName}>{label}</label>
        {required && <span className="text-xs text-[#f7594b]">*</span>}
      </div>
      {children}
      {errorText && <p className="mt-1 text-xs text-red-500">{errorText}</p>}
    </div>
  )
}
