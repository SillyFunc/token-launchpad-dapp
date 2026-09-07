import { useEffect, type InputHTMLAttributes, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useConfig, useReadContract } from 'wagmi'
import { writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { parseEther, formatEther, isAddress, type Hex } from 'viem'
import { hoursToSeconds, minutesToSeconds } from 'date-fns'
import { Calculator, Coins } from 'lucide-react'
import { Web3ActionButton } from '@/components/common/web3-action-button'

import { FormSectionTitle } from '@/components/common/form-section-title'
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

/** 整数输入清洗：仅保留数字、去前导零（范围回填在 blur 时进行，避免打断输入） */
const sanitizeIntInput = (raw: string) =>
  raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')

/** 小数输入清洗：仅保留数字与第一个小数点，最多 4 位小数 */
const sanitizeDecimalInput = (raw: string) => {
  let next = raw.replace(/[^\d.]/g, '')
  const firstDot = next.indexOf('.')
  if (firstDot !== -1) {
    next =
      next.slice(0, firstDot + 1) +
      next
        .slice(firstDot + 1)
        .replace(/\./g, '')
        .slice(0, 4)
  }
  const dotIndex = next.indexOf('.')
  const intPart = (dotIndex === -1 ? next : next.slice(0, dotIndex)).replace(
    /^0+(?=\d)/,
    '',
  )
  return dotIndex === -1 ? intPart : `${intPart || '0'}${next.slice(dotIndex)}`
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

  // 读取代币链上总量；预售份额由 coordinator.presaleBps() 动态决定
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

  // 平台底池比例（docs §3.2：动态读取，勿硬编码 30/20/50；setupPresale 后冻结进托管仓实例）
  const coordinatorAddress = getContractAddresses(DEFAULT_CHAIN_ID).coordinatorFactory
  const { data: allocationData } = useReadContract({
    address: coordinatorAddress,
    abi: CoordinatorFactoryAbi,
    functionName: 'presaleBps',
    chainId: DEFAULT_CHAIN_ID,
    query: { staleTime: Infinity },
  })
  const { data: poolBpsData } = useReadContract({
    address: coordinatorAddress,
    abi: CoordinatorFactoryAbi,
    functionName: 'poolBps',
    chainId: DEFAULT_CHAIN_ID,
    query: { staleTime: Infinity },
  })
  // 读取完成前保持 0，避免用默认份额短暂展示错误价格
  const presaleBps =
    allocationData == null ? 0n : BigInt(allocationData as bigint | number | string)
  const poolBps = Number(poolBpsData ?? 2000)

  const totalSupply = (totalSupplyData as bigint | undefined) ?? 0n
  const totalSupplyNum = Number(formatEther(totalSupply))
  const totalSupplyText =
    totalSupply > 0n ? formatTokenSupply(totalSupply, locale) : '--'
  const presaleShare = (totalSupply * presaleBps) / 10000n
  const presaleShareNum = Number(formatEther(presaleShare))
  const presaleShareText =
    presaleShare > 0n ? formatTokenSupply(presaleShare, locale) : '--'

  // 开盘池代币份额 = 发行总量 × poolBps；创建者购买上限 = 份额的 25%
  // （合约常量 MAX_CREATOR_BUY_POOL_BPS = 2500，BNB 口径 ≈ 开盘池 BNB（硬顶）的 1/3）
  const poolShare = (totalSupply * BigInt(poolBps)) / 10000n
  const poolShareNum = Number(formatEther(poolShare))
  const maxCreatorBuyTokensNum =
    poolShare > 0n ? Number(formatEther(poolShare / 4n)) : 0

  // 预售价 = hardcap / presaleShare，按 18 位 wei 精度计算
  const calculatePriceBnb = (hardcapStr: string): string => {
    if (!hardcapStr || presaleShare <= 0n) return ''
    const hardcapWei = parseEther(hardcapStr)
    const priceWei = (hardcapWei * 10n ** 18n) / presaleShare
    return priceWei > 0n ? formatEther(priceWei) : ''
  }

  const initialHardcap = token?.hardcap ? String(token.hardcap) : ''
  const initialSoftcap =
    token?.softcap || token?.soft ? String(token.softcap || token.soft) : ''

  const initialMaxBuyPercent = (() => {
    if (token?.maxBuyPerWallet && presaleShareNum > 0) {
      const p = Math.round(
        (Number(token.maxBuyPerWallet) / presaleShareNum) * 100,
      )
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
      const hardcapWei = parseEther(value.hardcap || '0')
      // 软顶取表单实际填写值（校验器已约束在硬顶的 50% ~ 100%）
      const softcapStr = value.softcap || '0'
      const softcapWei = parseEther(softcapStr)
      const minLiquidityWei = softcapWei // 自动对齐软顶

      // 预售价由硬顶与预售份额自动计算
      const priceWei =
        presaleShare > 0n && hardcapWei > 0n
          ? (hardcapWei * 10n ** 18n) / presaleShare
          : parseEther('0')
      if (priceWei <= 0n) {
        toast.error('请先输入有效的硬顶，并等待预售份额读取完成')
        return
      }
      const priceBNB = formatEther(priceWei)

      // 测试阶段临时放宽链上单钱包上限：始终传入完整预售份额（硬顶的 100%）。
      // UI 仍保留 2%~5% 滑杆与原有展示，后续恢复真实限购时无需改交互。
      // 预售价 = hardcap / presaleShare，因此完整预售份额对应硬顶 100%。
      const maxBuyWei = presaleShare
      const maxBuyTokensStr = formatEther(maxBuyWei)

      // 测试网环境：无论 UI 输入多少，接口与合约统一固定传入 5 分钟 (300 秒)
      const FIXED_VESTING_DELAY_SEC = 300
      const vestingDelaySec = BigInt(FIXED_VESTING_DELAY_SEC)

      // 认购时长（秒）：1 分钟 ~ 30 天，默认 30 分钟
      const durationSec = Math.round(
        (
          DURATION_UNITS[(value.durationUnit || '分钟') as DurationUnit] ??
          minutesToSeconds
        )(Number(value.durationValue || '0')),
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

      // 代币模式注资：按恒定乘积精确覆盖价格影响 B·t/(T−t)（t ≤ T/4 时恰为池 BNB 的 1/3，
      // 与创建者购买上限同口径）；合约对超额部分同交易自动退回
      if (creatorBuyTokensWei > 0n) {
        if (poolShare <= creatorBuyTokensWei) {
          toast.error('发行总量未就绪，无法计算创建者购买注资')
          return
        }
        creatorBuyBnbWei =
          (hardcapWei * creatorBuyTokensWei) / (poolShare - creatorBuyTokensWei)
      }

      // 校验创建者购买上限：开盘池代币份额的 25%（BNB 注资口径 = 池 BNB 的 1/3）
      const creatorBuyBnbNum = Number(formatEther(creatorBuyBnbWei))
      const maxCreatorBuyBnbAllowed = hardcapNum / 3
      if (
        maxCreatorBuyBnbAllowed > 0 &&
        creatorBuyBnbNum > maxCreatorBuyBnbAllowed + 0.0001
      ) {
        toast.error(
          `创建者注资不能超过购买上限（开盘池份额 25% ≈ ${maxCreatorBuyBnbAllowed.toFixed(4)} BNB）`,
        )
        return
      }
      if (poolShare > 0n && creatorBuyTokensWei > poolShare / 4n) {
        toast.error(
          `创建者购买数量不能超过开盘池份额的 25%（${formatTokenSupply(poolShare / 4n, locale)} 枚）`,
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
          softcap: softcapStr,
          minLiquidityAmount: softcapStr,
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

  // 总量/分配比例异步读取完成后，为新建表单补上自动预售价；已有价格不覆盖
  useEffect(() => {
    if (
      !token?.presaleTokenPrice &&
      form.getFieldValue('hardcap') &&
      presaleShare > 0n &&
      !form.getFieldValue('presaleTokenPrice')
    ) {
      form.setFieldValue(
        'presaleTokenPrice',
        calculatePriceBnb(form.getFieldValue('hardcap')),
      )
    }
  }, [presaleShare, token?.presaleTokenPrice])

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
              <UnitInput
                id={field.name}
                name={field.name}
                inputMode="decimal"
                autoComplete="off"
                placeholder=""
                value={field.state.value}
                onChange={(e) => {
                  const val = sanitizeDecimalInput(e.target.value)
                  field.handleChange(val)
                  form.setFieldValue('presaleTokenPrice', calculatePriceBnb(val))
                }}
                onBlur={field.handleBlur}
                unit="BNB"
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
              // 合法区间：硬顶的 50% ~ 100%，可等于硬顶（0.0001 容差吸收浮点误差）
              const minSoftcap = Number((hardcap * 0.5).toFixed(4))
              if (n < minSoftcap - 0.0001)
                return `软顶不能低于硬顶的 50%（当前硬顶 ${hardcap} BNB，软顶至少 ${minSoftcap} BNB）`
              if (n > hardcap + 0.0001)
                return `软顶不能超过硬顶（当前硬顶 ${hardcap} BNB）`
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap label="软顶" required error={field.state.meta.errors[0]}>
              <UnitInput
                id={field.name}
                name={field.name}
                inputMode="decimal"
                autoComplete="off"
                placeholder=""
                value={field.state.value}
                onChange={(e) =>
                  field.handleChange(sanitizeDecimalInput(e.target.value))
                }
                onBlur={field.handleBlur}
                unit="BNB"
              />
            </FieldWrap>
          )}
        </form.Field>
{/* 
        <form.Subscribe selector={(state) => state.values.presaleTokenPrice}>
          {(presaleTokenPrice) => (
            <FieldWrap label="预售价格" required>
              <div className="flex h-10.5 items-center justify-between rounded-xs border border-[#484b51] bg-[#181a1d] px-3 text-sm text-white">
                <span className="font-mono font-medium">
                  {presaleTokenPrice || '--'}
                </span>
                <span className="text-xs font-semibold text-[#FE810B]">
                  BNB/枚
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                预售价 = 硬顶 ÷ 预售份额，随硬顶自动更新
              </p>
            </FieldWrap>
          )}
        </form.Subscribe> */}


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

        <form.Subscribe selector={(state) => state.values.presaleTokenPrice}>
          {(presaleTokenPrice) => {
            const hasPrice =
              Boolean(presaleTokenPrice) && Number(presaleTokenPrice) > 0

            return (
              <div className="flex flex-col divide-y divide-white/5 border border-[#2F3737] bg-[#181a1d] px-3.5 py-1 text-xs">
                <div className="flex h-10 items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Coins className="size-3.5 shrink-0 text-[#FFA546]" />
                    <span className="text-xs font-medium leading-none text-neutral-200">
                      发行总量
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 text-right">
                    <span
                      className="font-mono text-sm font-bold text-white"
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

                <div className="flex h-10 items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Coins className="size-3.5 shrink-0 text-[#FFA546]" />
                    <span className="text-xs font-medium leading-none text-neutral-200">
                      预售总量
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 text-right">
                    <span
                      className="font-mono text-sm font-bold text-white"
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

                <div className="flex h-10 items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="size-3.5 shrink-0 text-[#FFA546]" />
                    <span className="text-xs font-medium leading-none text-neutral-200">
                      预售价格
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 text-right">
                    <span className="font-mono text-sm font-bold text-[#FFA546]">
                      {hasPrice ? presaleTokenPrice : '--'}
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
                    <UnitInput
                      id={field.name}
                      name={field.name}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder=""
                      value={field.state.value}
                      onChange={(e) =>
                        field.handleChange(sanitizeIntInput(e.target.value))
                      }
                      onBlur={() => {
                        field.handleBlur()
                        // 输入 0 自动回填最小值 1（超上限的情况由 validator 提示）
                        if (field.state.value === '0') field.handleChange('1')
                      }}
                      unit={unit}
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
              <UnitInput
                id={field.name}
                name={field.name}
                inputMode="numeric"
                autoComplete="off"
                placeholder=""
                value={field.state.value}
                onChange={(e) =>
                  field.handleChange(sanitizeIntInput(e.target.value))
                }
                onBlur={() => {
                  field.handleBlur()
                  // 超出 7-90 天限制范围 → 自动回填最小值 7 天
                  const n = Number(field.state.value)
                  if (field.state.value && (n < 7 || n > 90)) {
                    field.handleChange('7')
                  }
                }}
                unit="天"
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
            hardcap: state.values.hardcap,
          })}
        >
          {({ creatorBuyBnb, creatorBuyTokens, hardcap }) => {
            const hardcapNum = Number(hardcap || 0)
            // BNB 注资口径上限 = 开盘池 BNB（≈硬顶）的 1/3，恒定乘积下恰为买走 25% 池代币
            const maxCreatorBuyBnb =
              hardcapNum > 0 ? Number((hardcapNum / 3).toFixed(4)) : 0
            // 开盘池价（BNB/枚 = 硬顶 / 池份额），仅用于创建者购买的换算预估
            const poolTokenPriceBnb =
              hardcapNum > 0 && poolShareNum > 0 ? hardcapNum / poolShareNum : 0

            return (
              <CreatorBuySection
                address={address}
                poolTokenPriceBnb={poolTokenPriceBnb}
                creatorBuyBnb={creatorBuyBnb}
                creatorBuyTokens={creatorBuyTokens}
                maxCreatorBuyBnb={maxCreatorBuyBnb}
                maxCreatorBuyTokens={maxCreatorBuyTokensNum}
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

/** 原生数字输入框：唤起手机系统数字键盘，右侧带单位后缀 */
function UnitInput({
  unit,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  unit: string
}) {
  return (
    <div className="relative">
      <input
        {...props}
        className="w-full h-10.5 pl-3 pr-12 text-sm border border-[#84888c] bg-transparent rounded-xs text-white focus-visible:outline-none focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-[#FE810B] box-border appearance-none"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-[#FE810B]">
        {unit}
      </span>
    </div>
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
      {errorText && <p className="mt-1 text-xs text-[#f7594b]">{errorText}</p>}
    </div>
  )
}
