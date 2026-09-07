import { useEffect, useMemo, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { useForm } from '@tanstack/react-form'
import { useConfig, useReadContract } from 'wagmi'
import { waitForTransactionReceipt, writeContract } from '@wagmi/core'
import { formatEther, parseEther, type Hex } from 'viem'
import { hoursToSeconds, minutesToSeconds } from 'date-fns'

import type { TokenDetail } from '@/api/token'
import { updateTokenInfo } from '@/api/token'
import { requestAuthSignature } from '@/api/auth'
import { CreatorBuySection } from '@/components/presale/creator-buy-section'
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
  tokenAddress: string
  presaleAddress: Hex
  address: Hex
  gate: TokenGateResult
  onSuccess: () => void
}

export function RepresaleForm({ token, tokenAddress: _tokenAddress, presaleAddress, address, gate, onSuccess }: RepresaleFormProps) {
  const config = useConfig()
  const [hasRelaunched, setHasRelaunched] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

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
  const { data: poolShareData } = useReadContract({
    address: presaleAddress,
    abi: PresaleAbi,
    functionName: 'poolShare',
    chainId: DEFAULT_CHAIN_ID,
    query: { staleTime: 30_000 },
  })
  const poolShare = (poolShareData as bigint | undefined) ?? 0n
  const { data: creatorBuyTokens } = useReadContract({
    address: presaleAddress,
    abi: PresaleAbi,
    functionName: 'creatorBuyTokens',
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
      creatorBuyBnb: gate.creatorBuyBnb > 0n ? formatEther(gate.creatorBuyBnb) : '',
      creatorBuyTokens:
        creatorBuyTokens != null && BigInt(creatorBuyTokens as bigint) > 0n
          ? formatEther(creatorBuyTokens as bigint)
          : '0',
    },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true)
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

        const nextBnb = parseEther(value.creatorBuyBnb || '0')
        const nextTokens = parseEther(value.creatorBuyTokens || '0')
        const previousBnb = gate.creatorBuyBnb
        const previousTokens = (creatorBuyTokens as bigint | undefined) ?? 0n
        if (nextBnb <= 0n && nextTokens <= 0n && previousBnb > 0n) {
          const withdrawHash = await writeContract(config, {
            address: presaleAddress,
            abi: PresaleAbi,
            functionName: 'withdrawCreatorBuy',
            account: address,
            chainId: DEFAULT_CHAIN_ID,
          })
          await waitForTransactionReceipt(config, { hash: withdrawHash, chainId: DEFAULT_CHAIN_ID })
        } else if (nextBnb > 0n && (nextBnb !== previousBnb || nextTokens !== previousTokens)) {
          const fundHash = await writeContract(config, {
            address: presaleAddress,
            abi: PresaleAbi,
            functionName: 'fundCreatorBuy',
            account: address,
            chainId: DEFAULT_CHAIN_ID,
            args: [nextTokens],
            value: nextBnb,
          })
          await waitForTransactionReceipt(config, { hash: fundHash, chainId: DEFAULT_CHAIN_ID })
        }

        if (token?.id) {
          try {
            const auth = await requestAuthSignature(config, address)
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
              startTime: Number(value.startTime || 0),
              endTime: Number(value.startTime || 0) + durationSec,
              vestingDelay: Number(vestingDelaySec),
              vestingRate: Number(value.vestingRate),
              slippage: Number(token?.slippage || 0),
              creatorBuyTokens: value.creatorBuyTokens || '0',
              creatorBuyBnb: value.creatorBuyBnb || '0',
              ...auth,
            })
          } catch (syncError) {
            console.warn('重开预售后端同步失败:', syncError)
          }
        }

        toast.success('预售条款已更新，请在控制台开启新一轮预售')
        onSuccess()
      } catch (error: unknown) {
        toast.error(parseContractError(error, error instanceof Error ? error.message : '重开预售失败'), '配置失败')
      } finally {
        setIsSubmitting(false)
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
        <FormSectionTitle title="新一轮预售参数" required />
        <div className="rounded border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
          分配份额、预售模式和代币绑定已永久锁定，本页只修改新一轮商业条款。提交后不会自动开启预售，请回控制台确认开启。
        </div>

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

        <form.Field name="maxBuyPercent" validators={{ onChange: ({ value }) => { const n = Number(value); return Number.isInteger(n) && n >= 2 && n <= 5 ? undefined : '单钱包限额比例须为 2% 至 5% 之间的整数' } }}>
          {(field) => <div className="flex flex-col"><div className="text-sm text-white">单钱包认购上限</div><input type="range" min={2} max={5} step={1} value={Number(field.state.value)} onChange={(e) => field.handleChange(Number(e.target.value))} className="mt-3 accent-[#FE810B]" /><span className="mt-2 text-xs text-neutral-400">UI 保持 {field.state.value}%；测试配置实际传入完整预售份额，最多一个钱包认购硬顶 100%</span><FieldInfo field={field} /></div>}
        </form.Field>
      </div>

      <div className="flex flex-col gap-4">
        <FormSectionTitle title="认购时间" required />
        <form.Field name="startTime">{(field) => <FieldWrap label="开始时间" required><StartTimePicker value={field.state.value} onChange={field.handleChange} onBlur={field.handleBlur} /></FieldWrap>}</form.Field>
        <form.Field name="durationValue" validators={{ onChangeListenTo: ['durationUnit'], onChange: ({ value, fieldApi }) => { const unit = fieldApi.form.getFieldValue('durationUnit') as DurationUnit; const seconds = (DURATION_UNITS[unit] ?? minutesToSeconds)(Number(value)); return seconds >= DURATION_MIN_SEC && seconds <= DURATION_MAX_SEC ? undefined : '认购时长须在 1 分钟至 30 天之间' } }}>
          {(field) => <FieldWrap label="认购时长" required error={field.state.meta.errors[0]}><UnitInput inputMode="numeric" autoComplete="off" value={field.state.value} onChange={(e) => field.handleChange(sanitizeInteger(e.target.value))} onBlur={field.handleBlur} unit={form.state.values.durationUnit} /><div className="mt-2 grid grid-cols-3 gap-2">{(Object.keys(DURATION_UNITS) as DurationUnit[]).map((unit) => <button key={unit} type="button" onClick={() => form.setFieldValue('durationUnit', unit)} className={cn('h-9 border text-xs font-semibold', form.state.values.durationUnit === unit ? 'border-[#FE810B] bg-[#FE810B]/15 text-[#FFA546]' : 'border-[#2F3737] bg-[#1a1c1e] text-neutral-300')}>{unit}</button>)}</div></FieldWrap>}
        </form.Field>
      </div>

      <div className="flex flex-col gap-4">
        <FormSectionTitle title="锁仓释放" required />
        <form.Field name="vestingDelayMinutes" validators={{ onChange: ({ value }) => { const n = Number(value); return Number.isInteger(n) && n >= 1 && n <= 90 * 24 * 60 ? undefined : '释放周期须在 1 分钟至 90 天之间' } }}>
          {(field) => <FieldWrap label="释放周期" required error={field.state.meta.errors[0]}><UnitInput inputMode="numeric" autoComplete="off" value={field.state.value} onChange={(e) => field.handleChange(sanitizeInteger(e.target.value))} onBlur={field.handleBlur} unit="分钟" /></FieldWrap>}
        </form.Field>
        <form.Field name="vestingRate" validators={{ onChange: ({ value }) => [5, 10, 15, 20].includes(Number(value)) ? undefined : '请选择 5%、10%、15% 或 20% 释放档位' }}>
          {(field) => <FieldWrap label="释放比例" required error={field.state.meta.errors[0]}><div className="grid grid-cols-4 gap-2">{[5, 10, 15, 20].map((rate) => <button key={rate} type="button" onClick={() => field.handleChange(rate)} className={cn('h-10 border text-xs font-semibold', Number(field.state.value) === rate ? 'border-[#FE810B] bg-[#FE810B]/15 text-[#FFA546]' : 'border-[#2F3737] bg-[#1a1c1e] text-neutral-300')}>{rate}%</button>)}</div></FieldWrap>}
        </form.Field>
      </div>

      <CreatorBuySection
        address={address}
        poolTokenPriceBnb={form.state.values.hardcap && poolShare > 0n ? Number(form.state.values.hardcap) / Number(formatEther(poolShare)) : 0}
        creatorBuyBnb={form.state.values.creatorBuyBnb}
        creatorBuyTokens={form.state.values.creatorBuyTokens}
        onChangeBnb={(value) => form.setFieldValue('creatorBuyBnb', value)}
        onChangeTokens={(value) => form.setFieldValue('creatorBuyTokens', value)}
        maxCreatorBuyBnb={form.state.values.hardcap ? Number(form.state.values.hardcap) / 3 : 0}
        maxCreatorBuyTokens={poolShare > 0n ? Number(formatEther(poolShare / 4n)) : 0}
      />

      <div className="rounded border border-[#2F3737] bg-[#181a1d] p-3 text-xs text-neutral-400">
        滑点保护沿用链上当前配置，不在本轮重开中修改。
      </div>

      <Web3ActionButton type="submit" loading={isSubmitting} loadingText="保存重开配置中…" disabled={maxPresaleTokens === undefined || gate.isChainLoading} className="flex h-11 w-full items-center justify-center bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-base font-bold text-white">
        {hasRelaunched ? '继续保存配置' : '重开并保存配置'}
      </Web3ActionButton>
    </form>
  )
}
