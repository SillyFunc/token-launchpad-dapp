import { useEffect, useMemo, useState, type InputHTMLAttributes, type ReactNode } from 'react'
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
import { FieldInfo } from '@/components/common/field-info'
import { FormSectionTitle } from '@/components/common/form-section-title'
import { Web3ActionButton } from '@/components/common/web3-action-button'
import { toast } from '@/components/ui/toast'
import { PresaleAbi } from '@/contracts/abi'
import { DEFAULT_CHAIN_ID } from '@/config/network'
import { parseContractError } from '@/lib/contract-error'
import { formatDecimalText } from '@/lib/format'
import type { TokenGateResult } from '@/hooks/use-token-gate'
import { cn } from '@/lib/utils'
import { TaxSlider } from '@/components/common/tax-slider'

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

function sanitizeDecimal(raw: string) {
  let value = raw.replace(/[^\d.]/g, '')
  const dot = value.indexOf('.')
  if (dot >= 0) {
    value = `${value.slice(0, dot + 1)}${value.slice(dot + 1).replace(/\./g, '').slice(0, 4)}`
  }
  const dotIndex = value.indexOf('.')
  const integer = (dotIndex >= 0 ? value.slice(0, dotIndex) : value).replace(/^0+(?=\d)/, '')
  return dotIndex >= 0 ? `${integer || '0'}${value.slice(dotIndex)}` : integer
}

function durationDefaults(seconds: bigint): { value: string; unit: DurationUnit } {
  const total = Number(seconds)
  if (total > 0 && total % 86400 === 0) return { value: String(total / 86400), unit: '天' }
  if (total > 0 && total % 3600 === 0) return { value: String(total / 3600), unit: '小时' }
  return { value: String(Math.max(1, Math.round(total / 60))), unit: '分钟' }
}

function formatError(error: unknown) {
  return typeof error === 'string'
    ? error
    : (error as { message?: string } | undefined)?.message
}

function UnitInput({ unit, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & { unit: string }) {
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

function FieldWrap({ label, required = false, error, children }: { label: string; required?: boolean; error?: unknown; children: ReactNode }) {
  const errorText = formatError(error)
  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-center gap-0.5">
        <label className="text-sm text-white">{label}</label>
        {required && <span className="text-xs text-[#f7594b]">*</span>}
      </div>
      {children}
      {errorText && <p className="mt-1 text-xs text-red-500">{errorText}</p>}
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

export function RepresaleForm({ token, presaleAddress, address, gate, onSuccess }: RepresaleFormProps) {
  const config = useConfig()
  const [hasRelaunched, setHasRelaunched] = useState(false)

  const { data: maxPresaleTokens } = useReadContract({
    address: presaleAddress,
    abi: PresaleAbi,
    functionName: 'maxPresaleTokens',
    chainId: DEFAULT_CHAIN_ID,
    query: { staleTime: 30_000 },
  })
  const { data: startTime } = useReadContract({
    address: presaleAddress,
    abi: PresaleAbi,
    functionName: 'startTime',
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
  const maxBuyPercent = gate.presaleShare > 0n && gate.onchainMaxBuy > 0n
    ? Math.min(5, Math.max(2, Math.round(Number((gate.onchainMaxBuy * 100n) / gate.presaleShare))))
    : 2

  const form = useForm({
    defaultValues: {
      hardcap: initialHardcap,
      softcap: initialSoftcap,
      maxBuyPercent,
      startTime: startTime !== undefined ? String(startTime) : '0',
      durationValue: initialDuration.value,
      durationUnit: initialDuration.unit,
      vestingDelayMinutes: initialVestingMinutes,
      vestingRate: Number(gate.vestingRate) || 5,
    },
    onSubmit: async ({ value }) => {
      try {
        const hardcapWei = parseEther(value.hardcap || '0')
        const softcapWei = parseEther(value.softcap || '0')
        const presaleShare = gate.presaleShare
        if (hardcapWei <= 0n || presaleShare <= 0n) throw new Error('硬顶或预售份额尚未准备好')
        if (softcapWei < hardcapWei / 2n || softcapWei > hardcapWei) throw new Error('软顶必须在硬顶的 50% 至 100% 之间')

        const priceWei = (hardcapWei * 10n ** 18n) / presaleShare
        const maxTokensWei = (maxPresaleTokens as bigint | undefined) ?? presaleShare
        const durationSec = Math.round(
          (DURATION_UNITS[value.durationUnit as DurationUnit] ?? minutesToSeconds)(Number(value.durationValue || 0)),
        )
        const vestingDelaySec = BigInt(Math.round(Number(value.vestingDelayMinutes || 0) * 60))
        if (durationSec < DURATION_MIN_SEC || durationSec > DURATION_MAX_SEC) throw new Error('认购时长须在 1 分钟至 30 天之间')
        if (vestingDelaySec < 60n || vestingDelaySec > 90n * 86400n) throw new Error('释放周期须在 1 分钟至 90 天之间')
        if (!token?.id) throw new Error('未获取到代币 ID，无法同步预售数据')

        // 中心化接口鉴权必须在任何链上写操作之前完成，避免链上已成功但后台无法同步。
        const auth = await requestAuthSignature(config, address)

        if (!hasRelaunched) {
          const relaunchHash = await writeContract(config, {
            address: presaleAddress,
            abi: PresaleAbi,
            functionName: 'relaunchPresale',
            account: address,
            chainId: DEFAULT_CHAIN_ID,
          })
          await waitForTransactionReceipt(config, { hash: relaunchHash, chainId: DEFAULT_CHAIN_ID })
          setHasRelaunched(true)
        }

        const termsHash = await writeContract(config, {
          address: presaleAddress,
          abi: PresaleAbi,
          functionName: 'setPresaleTerms',
          account: address,
          chainId: DEFAULT_CHAIN_ID,
          args: [priceWei, maxTokensWei, presaleShare, hardcapWei, softcapWei, BigInt(value.startTime || 0), BigInt(durationSec)],
        })
        await waitForTransactionReceipt(config, { hash: termsHash, chainId: DEFAULT_CHAIN_ID })

        const softCapHash = await writeContract(config, {
          address: presaleAddress,
          abi: PresaleAbi,
          functionName: 'setSoftCap',
          account: address,
          chainId: DEFAULT_CHAIN_ID,
          args: [softcapWei],
        })
        await waitForTransactionReceipt(config, { hash: softCapHash, chainId: DEFAULT_CHAIN_ID })

        const vestingHash = await writeContract(config, {
          address: presaleAddress,
          abi: PresaleAbi,
          functionName: 'setVestingConfig',
          account: address,
          chainId: DEFAULT_CHAIN_ID,
          args: [vestingDelaySec, BigInt(Number(value.vestingRate))],
        })
        await waitForTransactionReceipt(config, { hash: vestingHash, chainId: DEFAULT_CHAIN_ID })

        // 与首次配置表单一致：链上配置成功后同步中心化接口。
        const startTimeSec = Number(value.startTime || 0)
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
          maxBuyPerWallet: formatEther(presaleShare),
          hardcap: value.hardcap,
          softcap: value.softcap,
          minLiquidityAmount: value.softcap,
          startTime: startTimeSec,
          endTime: startTimeSec > 0 ? startTimeSec + durationSec : 0,
          vestingDelay: Number(vestingDelaySec),
          vestingRate: Number(value.vestingRate),
          slippage: Number(token.slippage || 0),
          ...auth,
        })

        toast.success('预售条款已更新，请在控制台开启新一轮预售')
        onSuccess()
      } catch (error: unknown) {
        toast.error(parseContractError(error, error instanceof Error ? error.message : '重开预售失败'), '配置失败')
      }
    },
  })

  useEffect(() => {
    if (startTime !== undefined) form.setFieldValue('startTime', String(startTime))
  }, [startTime])

  const priceWei = gate.presaleShare > 0n && gate.hardCap > 0n
    ? (gate.hardCap * 10n ** 18n) / gate.presaleShare
    : 0n
  const calculatedPrice = form.state.values.hardcap && gate.presaleShare > 0n
    ? (() => {
        try { return formatEther((parseEther(form.state.values.hardcap) * 10n ** 18n) / gate.presaleShare) } catch { return '' }
      })()
    : priceWei > 0n ? formatEther(priceWei) : ''

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
              !value || Number(value) <= 0 ? '请输入大于 0 的硬顶金额' : undefined,
          }}
        >
          {(field) => (
            <FieldWrap label="硬顶" required error={field.state.meta.errors[0]}>
              <UnitInput
                inputMode="decimal"
                autoComplete="off"
                value={field.state.value}
                onChange={(event) => {
                  const value = sanitizeDecimal(event.target.value)
                  field.handleChange(value)
                  form.setFieldValue(
                    'softcap',
                    value
                      ? String(
                          Math.max(
                            Number(form.getFieldValue('softcap') || 0),
                            Number(value) * 0.5,
                          ),
                        )
                      : '',
                  )
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
            <FieldWrap label="软顶" required error={field.state.meta.errors[0]}>
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
            </FieldWrap>
          )}
        </form.Field>

        <FieldWrap label="预售价格" required>
          <div className="flex h-10.5 items-center justify-between rounded-xs border border-[#484b51] bg-[#181a1d] px-3 text-sm text-white"><span className="font-mono font-medium">{calculatedPrice || '--'}</span><span className="text-xs font-semibold text-[#FE810B]">BNB/枚</span></div>
          <p className="mt-1 text-xs text-neutral-500">预售价 = 硬顶 ÷ 已冻结预售份额</p>
        </FieldWrap>

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
                  const p = hardcapNum > 0 ? Number(percent || 2) : 0
                  const maxBnb = hardcapNum > 0
                    ? Number((hardcapNum * (p / 100)).toFixed(4))
                    : 0
                  return (
                    <span className="mt-2.5 text-xs text-neutral-400">
                      每个钱包最多出资 {maxBnb} BNB（占硬顶 {p}%）
                    </span>
                  )
                }}
              </form.Subscribe>
              <FieldInfo field={field} />
            </div>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.hardcap}>
          {(hardcap) => {
            const price = hardcap && gate.presaleShare > 0n
              ? (() => { try { return formatEther((parseEther(hardcap) * 10n ** 18n) / gate.presaleShare) } catch { return '' } })()
              : ''
            return (
              <div className="flex flex-col divide-y divide-white/5 border border-[#2F3737] bg-[#181a1d] px-3.5 py-1 text-xs">
                <div className="flex h-10 items-center justify-between">
                  <div className="flex items-center gap-1.5"><Coins className="size-3.5 shrink-0 text-[#FFA546]" /><span className="text-xs font-medium leading-none text-neutral-200">预售总量</span></div>
                  <div className="flex items-baseline gap-1 text-right"><span className="font-mono text-sm font-bold text-white">{formatEther(gate.presaleShare)}</span><span className="text-xs text-neutral-400">枚</span></div>
                </div>
                <div className="flex h-10 items-center justify-between">
                  <div className="flex items-center gap-1.5"><Calculator className="size-3.5 shrink-0 text-[#FFA546]" /><span className="text-xs font-medium leading-none text-neutral-200">预售价格</span></div>
                  <div className="flex items-baseline gap-1 text-right"><span className="font-mono text-sm font-bold text-[#FFA546]">{price || '--'}</span><span className="text-xs text-neutral-400">BNB</span></div>
                </div>
              </div>
            )
          }}
        </form.Subscribe>
      </div>

      <div className="flex flex-col gap-4">
        <FormSectionTitle title="认购时间" required />
        <form.Field name="startTime">{(field) => <FieldWrap label="开始时间" required><StartTimePicker value={field.state.value} onChange={field.handleChange} onBlur={field.handleBlur} /></FieldWrap>}</form.Field>
        <form.Field
          name="durationValue"
          validators={{
            onChangeListenTo: ['durationUnit'],
            onChange: ({ value, fieldApi }) => {
              const unit = fieldApi.form.getFieldValue('durationUnit') as DurationUnit
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
                      inputMode="numeric"
                      autoComplete="off"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(sanitizeInteger(event.target.value))
                      }
                      onBlur={field.handleBlur}
                      unit={unit}
                    />
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
            <FieldWrap label="释放周期" required error={field.state.meta.errors[0]}>
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
            <FieldWrap label="释放比例" required error={field.state.meta.errors[0]}>
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
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.isValid && !state.isSubmitting,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Web3ActionButton
              type="submit"
              disabled={!canSubmit || maxPresaleTokens === undefined || gate.isChainLoading}
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
