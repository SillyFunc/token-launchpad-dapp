import {
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { useForm } from '@tanstack/react-form'
import { useConfig, useReadContract } from 'wagmi'
import { waitForTransactionReceipt, writeContract } from '@wagmi/core'
import { formatEther, parseEther, type Hex } from 'viem'
import { hoursToSeconds, minutesToSeconds } from 'date-fns'
import { Calculator, Coins } from 'lucide-react'

import type { TokenDetail } from '@/api/token'
import { updateTokenInfo } from '@/api/token'
import { requestAuthSignature } from '@/api/auth'
import { StartTimePicker } from '@/components/presale/start-time-picker'
import { FormSectionTitle } from '@/components/common/form-section-title'
import { FieldInfo } from '@/components/common/field-info'
import { Web3ActionButton } from '@/components/common/web3-action-button'
import { toast } from '@/components/ui/toast'
import { PresaleAbi } from '@/contracts/abi'
import { DEFAULT_CHAIN_ID } from '@/config/network'
import { parseContractError } from '@/lib/contract-error'
import { formatDecimalText } from '@/lib/format'
import type { TokenGateResult } from '@/hooks/use-token-gate'
import { cn } from '@/lib/utils'

const DURATION_MIN_SEC = minutesToSeconds(1)
const DURATION_MAX_SEC = hoursToSeconds(24 * 30)
const DURATION_UNITS = {
  分钟: minutesToSeconds,
  小时: hoursToSeconds,
  天: (value: number) => hoursToSeconds(value * 24),
} as const
type DurationUnit = keyof typeof DURATION_UNITS

function sanitizeInteger(raw: string) {
  return raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
}

function sanitizeDecimal(raw: string, maxDecimals = 4) {
  let value = raw.replace(/[^\d.]/g, '')
  const dot = value.indexOf('.')
  if (dot >= 0) {
    value = `${value.slice(0, dot + 1)}${value
      .slice(dot + 1)
      .replace(/\./g, '')
      .slice(0, maxDecimals)}`
  }
  const dotIndex = value.indexOf('.')
  const integer = (dotIndex >= 0 ? value.slice(0, dotIndex) : value).replace(
    /^0+(?=\d)/,
    '',
  )
  return dotIndex >= 0 ? `${integer || '0'}${value.slice(dotIndex)}` : integer
}

function durationDefaults(seconds: bigint): {
  value: string
  unit: DurationUnit
} {
  const total = Number(seconds)
  if (total > 0 && total % 86400 === 0)
    return { value: String(total / 86400), unit: '天' }
  if (total > 0 && total % 3600 === 0)
    return { value: String(total / 3600), unit: '小时' }
  return { value: String(Math.max(1, Math.round(total / 60))), unit: '分钟' }
}

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
        className="box-border h-10.5 w-full appearance-none rounded-xs border border-[#84888c] bg-transparent pl-3 pr-14 text-sm text-white focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B]"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-[#FE810B]">
        {unit}
      </span>
    </div>
  )
}

function FieldWrap({
  label,
  required = false,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-center gap-0.5">
        <label className="text-sm text-white">{label}</label>
        {required && <span className="text-xs text-[#f7594b]">*</span>}
      </div>
      {children}
    </div>
  )
}

export interface RepresaleFormProps {
  token: TokenDetail | null
  presaleAddress: Hex
  address: Hex
  gate: TokenGateResult
  onSuccess: () => void
}

export function RepresaleForm({
  token,
  presaleAddress,
  address,
  gate,
  onSuccess,
}: RepresaleFormProps) {
  const config = useConfig()
  const [submitStep, setSubmitStep] = useState('')
  // React state 更新不是同步锁；用 ref 阻止快速双击/并发 handleSubmit。
  const submitInFlightRef = useRef(false)

  const { data: maxPresaleTokens } = useReadContract({
    address: presaleAddress,
    abi: PresaleAbi,
    functionName: 'maxPresaleTokens',
    chainId: DEFAULT_CHAIN_ID,
    query: { staleTime: 30_000 },
  })
  const { data: duration } = useReadContract({
    address: presaleAddress,
    abi: PresaleAbi,
    functionName: 'presaleDuration',
    chainId: DEFAULT_CHAIN_ID,
    query: { staleTime: 30_000 },
  })
  const { data: onchainSlippage } = useReadContract({
    address: presaleAddress,
    abi: PresaleAbi,
    functionName: 'slippageProtection',
    chainId: DEFAULT_CHAIN_ID,
    query: { staleTime: 30_000 },
  })
  const initialDuration = useMemo(
    () => durationDefaults((duration as bigint | undefined) ?? 1800n),
    [duration],
  )
  const initialHardcap = gate.hardCap > 0n ? formatEther(gate.hardCap) : ''
  const initialSoftcap = gate.softCap > 0n ? formatEther(gate.softCap) : ''
  const initialVestingMinutes =
    gate.vestingDelay > 0n
      ? String(Math.max(1, Math.ceil(Number(gate.vestingDelay) / 60)))
      : '5'
  const initialPrice =
    gate.onchainPresalePrice > 0n ? formatEther(gate.onchainPresalePrice) : ''
  const initialMaxBuyBnb =
    gate.onchainMaxBuy > 0n && gate.onchainPresalePrice > 0n
      ? formatEther(
          (gate.onchainMaxBuy * gate.onchainPresalePrice) / 10n ** 18n,
        )
      : ''

  const form = useForm({
    defaultValues: {
      hardcap: initialHardcap,
      softcap: initialSoftcap,
      presaleTokenPrice: initialPrice,
      maxBuyBnb: initialMaxBuyBnb,
      startTime: '',
      durationValue: initialDuration.value,
      durationUnit: initialDuration.unit,
      vestingDelayMinutes: initialVestingMinutes,
      vestingRate: Number(gate.vestingRate) || 5,
    },
    onSubmit: async ({ value }) => {
      if (submitInFlightRef.current) return
      submitInFlightRef.current = true

      try {
        const hardcapWei = parseEther(value.hardcap || '0')
        const softcapWei = parseEther(value.softcap || '0')
        const presaleShare = gate.presaleShare
        if (hardcapWei <= 0n || presaleShare <= 0n)
          throw new Error('硬顶或预售份额尚未准备好')
        if (softcapWei < hardcapWei / 2n || softcapWei > hardcapWei)
          throw new Error('软顶必须在硬顶的 50% 至 100% 之间')

        const priceWei = parseEther(value.presaleTokenPrice || '0')
        if (priceWei <= 0n) throw new Error('预售价格必须大于 0')
        const maxRaiseWei = (priceWei * presaleShare) / 10n ** 18n
        if (maxRaiseWei < softcapWei)
          throw new Error('当前预售价下即使售罄也达不到软顶，请提高预售价')
        const maxBuyBnbWei = parseEther(value.maxBuyBnb || '0')
        if (
          maxBuyBnbWei <= 0n ||
          maxBuyBnbWei > hardcapWei ||
          maxBuyBnbWei > maxRaiseWei
        )
          throw new Error('单钱包认购上限须大于 0 且不超过可募集金额')
        const maxBuyTokensWei = (maxBuyBnbWei * 10n ** 18n) / priceWei
        if (maxBuyTokensWei <= 0n)
          throw new Error('单钱包认购上限过小，换算后不足 1 个最小代币单位')
        const maxPresaleTokensWei =
          (maxPresaleTokens as bigint | undefined) ?? presaleShare
        if (maxPresaleTokensWei <= 0n || maxPresaleTokensWei > presaleShare)
          throw new Error('预售总量配置无效')
        const durationSec = Math.round(
          (
            DURATION_UNITS[value.durationUnit as DurationUnit] ??
            minutesToSeconds
          )(Number(value.durationValue || 0)),
        )
        const vestingDelaySec = BigInt(
          Math.round(Number(value.vestingDelayMinutes || 0) * 60),
        )
        if (durationSec < DURATION_MIN_SEC || durationSec > DURATION_MAX_SEC)
          throw new Error('认购时长须在 1 分钟至 30 天之间')
        if (vestingDelaySec < 60n || vestingDelaySec > 90n * 86400n)
          throw new Error('释放周期须在 1 分钟至 90 天之间')
        if (!token?.id) throw new Error('未获取到代币 ID，无法同步预售数据')

        const startTimeSec = Number(value.startTime || 0)
        if (!startTimeSec || startTimeSec <= Math.floor(Date.now() / 1000)) {
          throw new Error('开始时间必须晚于当前时间，请重新选择开始时间')
        }

        const slippageBps =
          (onchainSlippage as bigint | undefined) !== undefined &&
          (onchainSlippage as bigint) > 0n
            ? (onchainSlippage as bigint)
            : Number(token?.slippage) > 0
              ? BigInt(Number(token?.slippage))
              : 500n // 默认 500 bps = 5%

        // 中心化接口鉴权必须在任何链上写操作之前完成，避免链上已成功但后台无法同步。
        const auth = await requestAuthSignature(config, address)

        // 步骤 1: 兜底检测重置状态（正常流程已在控制台 TokenCard 完成重置；若用户直接进入且仍为 status 4 则补一次）
        if (gate.presaleStatus === 4) {
          setSubmitStep('重置预售状态…')
          const relaunchHash = await writeContract(config, {
            address: presaleAddress,
            abi: PresaleAbi,
            functionName: 'relaunchPresale',
            account: address,
            chainId: DEFAULT_CHAIN_ID,
          })
          await waitForTransactionReceipt(config, {
            hash: relaunchHash,
            chainId: DEFAULT_CHAIN_ID,
          })
        }

        // 步骤 2: 调用全新原子化方法 setPresaleConfig 一笔交易覆盖全部商业条款
        setSubmitStep('更新预售条款中…')
        const configHash = await writeContract(config, {
          address: presaleAddress,
          abi: PresaleAbi,
          functionName: 'setPresaleConfig',
          account: address,
          chainId: DEFAULT_CHAIN_ID,
          args: [
            {
              presaleTokenPrice: priceWei,
              maxPresaleTokens: maxPresaleTokensWei,
              maxBuyPerWallet: maxBuyTokensWei,
              hardcap: hardcapWei,
              minLiquidityAmount: softcapWei,
              softCap: softcapWei,
              startTime: BigInt(startTimeSec),
              duration: BigInt(durationSec),
              vestingDelay: vestingDelaySec,
              vestingRate: BigInt(Number(value.vestingRate)),
              slippageProtection: slippageBps,
            },
          ],
        })
        await waitForTransactionReceipt(config, {
          hash: configHash,
          chainId: DEFAULT_CHAIN_ID,
        })

        // 步骤 3: 链上配置成功后同步中心化接口
        setSubmitStep('同步平台数据中…')
        await updateTokenInfo({
          id: token.id,
          name: token.name,
          coinImg: token.coinImg,
          symbol: token.symbol,
          meta: token.meta || token.zhIntroduction || '',
          buyTax: token.buyTax ?? 0,
          sellTax: token.sellTax ?? 0,
          feeRecipient: token.feeRecipient || address,
          taxDuration: Number(token.taxDuration) || 30,
          antiFarmerDuration: Number(token.antiFarmerDuration) || 0,
          liqExpectedOutputAmount: 0,
          launchType: token.launchType || 2,
          website: token.website || '',
          telegram: token.telegram || '',
          twitter: token.twitter || '',
          presaleTokenPrice: formatEther(priceWei),
          maxBuyPerWallet: formatEther(maxBuyTokensWei),
          hardcap: value.hardcap,
          softcap: value.softcap,
          minLiquidityAmount: value.softcap,
          startTime: startTimeSec,
          endTime: startTimeSec > 0 ? startTimeSec + durationSec : 0,
          vestingDelay: Number(vestingDelaySec),
          vestingRate: Number(value.vestingRate),
          slippage: Number(slippageBps),
          ...auth,
        })

        toast.success('预售条款已更新，请在控制台开启新一轮预售')
        onSuccess()
      } catch (error: unknown) {
        toast.error(
          parseContractError(
            error,
            error instanceof Error ? error.message : '重开预售失败',
          ),
          '配置失败',
        )
      } finally {
        submitInFlightRef.current = false
        setSubmitStep('')
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="flex flex-col gap-4">
        <FormSectionTitle title="认购参数" required />

        <form.Field
          name="hardcap"
          validators={{
            onChange: ({ value }) =>
              !value || Number(value) <= 0
                ? '请输入大于 0 的硬顶金额'
                : undefined,
          }}
        >
          {(field) => (
            <FieldWrap label="硬顶" required>
              <UnitInput
                inputMode="decimal"
                autoComplete="off"
                value={field.state.value}
                onChange={(event) =>
                  field.handleChange(sanitizeDecimal(event.target.value))
                }
                onBlur={field.handleBlur}
                unit="BNB"
              />
              <FieldInfo field={field} />
            </FieldWrap>
          )}
        </form.Field>

        <form.Field
          name="softcap"
          validators={{
            onChangeListenTo: ['hardcap'],
            onChange: ({ value, fieldApi }) => {
              const n = Number(value)
              const hardcap = Number(fieldApi.form.getFieldValue('hardcap'))
              if (!value || !Number.isFinite(n) || n <= 0)
                return '请输入大于 0 的软顶金额'
              if (!Number.isFinite(hardcap) || hardcap <= 0)
                return '请先输入有效的硬顶金额'
              if (n < hardcap * 0.5)
                return `软顶不能低于硬顶的 50%（至少 ${formatDecimalText(hardcap * 0.5)} BNB）`
              if (n > hardcap) return '软顶不能超过硬顶'
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap label="软顶" required>
              <UnitInput
                inputMode="decimal"
                autoComplete="off"
                value={field.state.value}
                onChange={(event) =>
                  field.handleChange(sanitizeDecimal(event.target.value))
                }
                onBlur={field.handleBlur}
                unit="BNB"
              />
              <FieldInfo field={field} />
            </FieldWrap>
          )}
        </form.Field>

        <form.Field
          name="presaleTokenPrice"
          validators={{
            onChange: ({ value }) => {
              if (!value) return '请输入预售价格'
              try {
                if (parseEther(value) <= 0n) return '预售价格必须大于 0'
              } catch {
                return '请输入有效的 BNB 价格'
              }
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap label="预售价格" required>
              <UnitInput
                inputMode="decimal"
                autoComplete="off"
                value={field.state.value}
                onChange={(event) =>
                  field.handleChange(sanitizeDecimal(event.target.value, 18))
                }
                onBlur={field.handleBlur}
                unit="BNB/枚"
              />
              <FieldInfo field={field} />
              <p className="mt-1 text-xs text-neutral-500">
                请输入项目方设定的每枚代币 BNB 价格
              </p>
            </FieldWrap>
          )}
        </form.Field>

        <form.Field
          name="maxBuyBnb"
          validators={{
            onChangeListenTo: ['hardcap', 'softcap', 'presaleTokenPrice'],
            onChange: ({ value, fieldApi }) => {
              if (!value) return '请输入单钱包认购上限'
              let maxBuyBnbWei: bigint
              let hardcapWei: bigint
              let softcapWei: bigint
              let priceWei: bigint
              try {
                maxBuyBnbWei = parseEther(value)
                hardcapWei = parseEther(
                  fieldApi.form.getFieldValue('hardcap') || '0',
                )
                softcapWei = parseEther(
                  fieldApi.form.getFieldValue('softcap') || '0',
                )
                priceWei = parseEther(
                  fieldApi.form.getFieldValue('presaleTokenPrice') || '0',
                )
              } catch {
                return '请输入有效的金额与预售价格'
              }
              if (maxBuyBnbWei <= 0n) return '单钱包认购上限必须大于 0'
              if (hardcapWei <= 0n) return '请先输入有效的硬顶金额'
              if (priceWei <= 0n) return '请先输入有效的预售价格'
              if (maxBuyBnbWei > hardcapWei) return '单钱包认购上限不能超过硬顶'
              const maxRaiseWei = (priceWei * gate.presaleShare) / 10n ** 18n
              if (maxRaiseWei < softcapWei)
                return '当前预售价下售罄也达不到软顶，请提高预售价'
              if (maxBuyBnbWei > maxRaiseWei)
                return '单钱包认购上限不能超过预售可募集总额'
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap label="单钱包认购上限" required>
              <UnitInput
                inputMode="decimal"
                autoComplete="off"
                value={field.state.value}
                onChange={(event) =>
                  field.handleChange(sanitizeDecimal(event.target.value))
                }
                onBlur={field.handleBlur}
                unit="BNB"
              />
              <FieldInfo field={field} />
            </FieldWrap>
          )}
        </form.Field>

        <form.Subscribe
          selector={(state) => ({
            price: state.values.presaleTokenPrice,
            hardcap: state.values.hardcap,
          })}
        >
          {({ price, hardcap }) => {
            let maxRaise = '--'
            try {
              const priceWei = parseEther(price || '0')
              const share = gate.presaleShare
              if (priceWei > 0n && share > 0n) {
                maxRaise = formatEther((priceWei * share) / 10n ** 18n)
              }
            } catch {
              maxRaise = '--'
            }
            return (
              <div className="flex flex-col divide-y divide-white/5 border border-[#2F3737] bg-[#181a1d] px-3.5 py-1 text-xs">
                <div className="flex h-10 items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Coins className="size-3.5 shrink-0 text-[#FFA546]" />
                    <span className="text-xs font-medium leading-none text-neutral-200">
                      预售总量
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 text-right">
                    <span className="font-mono text-sm font-bold text-white">
                      {formatEther(gate.presaleShare)}
                    </span>
                    <span className="text-xs text-neutral-400">枚</span>
                  </div>
                </div>
                <div className="flex h-10 items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="size-3.5 shrink-0 text-[#FFA546]" />
                    <span className="text-xs font-medium leading-none text-neutral-200">
                      按当前价格售罄募集
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 text-right">
                    <span className="font-mono text-sm font-bold text-[#FFA546]">
                      {maxRaise}
                    </span>
                    <span className="text-xs text-neutral-400">BNB</span>
                  </div>
                </div>
                <p className="py-2 text-xs text-neutral-500">
                  硬顶：{hardcap || '--'} BNB
                </p>
              </div>
            )
          }}
        </form.Subscribe>
      </div>

      <div className="flex flex-col gap-4">
        <FormSectionTitle title="认购时间" required />
        <form.Field
          name="startTime"
          validators={{
            onChange: ({ value }) => {
              const sec = Number(value)
              if (!value || isNaN(sec) || sec <= 0) return '请选择开始时间'
              if (sec <= Math.floor(Date.now() / 1000))
                return '开始时间必须晚于当前时间'
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap label="开始时间" required>
              <StartTimePicker
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
              <FieldInfo field={field} />
            </FieldWrap>
          )}
        </form.Field>
        <form.Field
          name="durationValue"
          validators={{
            onChangeListenTo: ['durationUnit'],
            onChange: ({ value, fieldApi }) => {
              const unit = fieldApi.form.getFieldValue(
                'durationUnit',
              ) as DurationUnit
              const seconds = (DURATION_UNITS[unit] ?? minutesToSeconds)(
                Number(value),
              )
              return seconds >= DURATION_MIN_SEC && seconds <= DURATION_MAX_SEC
                ? undefined
                : '认购时长须在 1 分钟至 30 天之间'
            },
          }}
        >
          {(field) => (
            <FieldWrap label="认购时长" required>
              <form.Subscribe
                selector={(state) =>
                  (state.values.durationUnit || '分钟') as DurationUnit
                }
              >
                {(unit) => (
                  <>
                    <UnitInput
                      inputMode="numeric"
                      autoComplete="off"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(sanitizeInteger(event.target.value))
                      }
                      onBlur={field.handleBlur}
                      unit={unit}
                    />
                    <FieldInfo field={field} />
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(Object.keys(DURATION_UNITS) as DurationUnit[]).map(
                        (durationUnit) => (
                          <button
                            key={durationUnit}
                            type="button"
                            onClick={() =>
                              form.setFieldValue('durationUnit', durationUnit)
                            }
                            className={cn(
                              'flex h-9 cursor-pointer items-center justify-center border text-xs font-semibold transition-all select-none',
                              unit === durationUnit
                                ? 'border-[#FE810B] bg-[#FE810B]/15 text-[#FFA546]'
                                : 'border-[#2F3737] bg-[#1a1c1e] text-neutral-300 hover:border-[#FE810B]/50 hover:text-white',
                            )}
                          >
                            {durationUnit}
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
          name="vestingDelayMinutes"
          validators={{
            onChange: ({ value }) => {
              const n = Number(value)
              if (!value || !Number.isInteger(n) || n < 1 || n > 90 * 24 * 60)
                return '释放周期须在 1 分钟至 90 天之间'
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap label="释放周期" required>
              <UnitInput
                inputMode="numeric"
                autoComplete="off"
                value={field.state.value}
                onChange={(event) =>
                  field.handleChange(sanitizeInteger(event.target.value))
                }
                onBlur={field.handleBlur}
                unit="分钟"
              />
            </FieldWrap>
          )}
        </form.Field>
        <form.Field
          name="vestingRate"
          validators={{
            onChange: ({ value }) =>
              [5, 10, 15, 20].includes(Number(value))
                ? undefined
                : '请选择 5%、10%、15% 或 20% 释放档位',
          }}
        >
          {(field) => (
            <FieldWrap label="释放比例" required>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 15, 20].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => field.handleChange(rate)}
                    className={cn(
                      'flex h-10 cursor-pointer items-center justify-center border text-xs font-semibold transition-all select-none',
                      Number(field.state.value) === rate
                        ? 'border-[#FE810B] bg-[#FE810B]/15 text-[#FFA546]'
                        : 'border-[#2F3737] bg-[#1a1c1e] text-neutral-300 hover:border-[#FE810B]/50 hover:text-white',
                    )}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </FieldWrap>
          )}
        </form.Field>
        <form.Subscribe
          selector={(state) => ({
            rate: Number(state.values.vestingRate) || 5,
            delay: Number(state.values.vestingDelayMinutes) || 1,
          })}
        >
          {({ rate, delay }) => (
            <div className="flex flex-col divide-y divide-white/5 border border-[#2F3737] bg-[#181a1d] px-4 py-3 text-xs">
              <div className="flex items-center justify-between pb-2.5">
                <span className="text-neutral-400">释放轮数</span>
                <span className="font-mono font-semibold text-white">
                  {Math.ceil(100 / rate)} 轮
                </span>
              </div>
              <div className="flex items-center justify-between pt-2.5">
                <span className="text-neutral-400">每轮释放</span>
                <span className="font-mono font-semibold text-white">
                  每 {delay} 分钟释放 {rate}%
                </span>
              </div>
            </div>
          )}
        </form.Subscribe>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-t-white/10 bg-[#131516] p-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col  items-center justify-between gap-3">
    

          <div className="w-full  ml-auto">
            <form.Subscribe
              selector={(state) => ({
                canSubmit:
                  state.canSubmit &&
                  Boolean(
                    state.values.hardcap &&
                    state.values.softcap &&
                    state.values.presaleTokenPrice &&
                    state.values.maxBuyBnb &&
                    state.values.startTime &&
                    Number(state.values.startTime) >
                      Math.floor(Date.now() / 1000),
                  ),
                isSubmitting: state.isSubmitting || Boolean(submitStep),
              })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Web3ActionButton
                  type="submit"
                  disabled={
                    !canSubmit ||
                    maxPresaleTokens === undefined ||
                    gate.isChainLoading
                  }
                  loading={isSubmitting}
                  loadingText={submitStep || '保存中…'}
                  className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-base font-bold text-white [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] transition-[transform,opacity] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFA546]"
                >
                  <span>保存预售条款</span>
                </Web3ActionButton>
              )}
            </form.Subscribe>
          </div>
        </div>
      </div>
    </form>
  )
}
