import { useEffect, useState, useRef, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { isAddress, type Hex } from 'viem'
import { useConnection } from 'wagmi'
import { Loader2, ExternalLink } from 'lucide-react'

import { useCreateToken, useCreationFee } from '@/hooks/use-coordinator'
import { NumericInput } from '@/components/ui/numeric-keypad'
import sectionIcon from '../assets/icons/section-title-icon.svg'
import uploadIcon from '../assets/upload-icon.svg'
import titleBackArrow from '../assets/icons/back-arrow.svg'

const optionalUrl = z.union([
  z.literal(''),
  z.url({ error: '请输入合法的 URL' }),
])

const nameSchema = z
  .string()
  .trim()
  .min(1, '请输入代币名称')
  .max(24, '代币名称最多 24 个字符')

const symbolSchema = z
  .string()
  .trim()
  .min(1, '请输入代币符号')
  .max(15, '代币符号最多 15 个字符')

const taxDurationSchema = z
  .string()
  .trim()
  .min(1, '请输入税费存续期')
  .refine((v) => {
    const n = Number(v)
    return v !== '' && Number.isInteger(n) && n >= 1 && n <= 365
  }, '请输入 1-365 之间的整数')

const antiFarmerDurationSchema = z
  .string()
  .trim()
  .refine((v) => {
    const n = Number(v)
    return v !== '' && Number.isInteger(n) && n >= 0 && n <= 365
  }, '请输入 0-365 之间的整数')

const evmAddressSchema = z
  .string()
  .trim()
  .min(1, '请输入税费接收地址')
  .refine((val) => !val || isAddress(val), '请输入合法的 EVM 地址')

const linkFields = [
  { label: 'Telegram 链接', key: 'telegram' },
  { label: 'Twitter 链接', key: 'twitter' },
  { label: 'GitHub 链接', key: 'github' },
  { label: 'YouTube 链接', key: 'youtube' },
  { label: 'DeBox 链接', key: 'debox' },
  { label: '网站链接', key: 'website' },
] as const

interface SectionHeaderProps {
  title: string
  required?: boolean
}

function SectionHeader({ title, required = false }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 relative">
      <img
        src={sectionIcon}
        alt=""
        aria-hidden="true"
        width={16}
        height={16}
        className="size-4 absolute -left-6 align-middle"
      />
      <h2 className="text-base font-normal leading-normal text-white uppercase pl-1.5">
        {title}
        {required && <span className="ml-0.5 text-[#f7594b]">*</span>}
      </h2>
    </div>
  )
}

interface TaxSliderProps {
  label: string
  value: number
  onChange: (val: number) => void
}

function TaxSlider({ label, value, onChange }: TaxSliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          <span className="text-sm text-white">{label}</span>
          <span className="text-sm text-[#f7594b]">*</span>
        </div>
        <div className="flex h-8 w-12 items-center justify-center rounded border border-white/30 bg-[#141517] text-sm font-bold text-[#FB5F16]">
          {value}%
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-white">
          <span>0%</span>
          <span>10%</span>
        </div>
        <div className="relative flex items-center py-1">
          <div className="h-1 w-full rounded-full bg-[#2F3737]">
            <div
              className="h-1 rounded-full bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B]"
              style={{ width: `${(value / 10) * 100}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={value}
            aria-label={label}
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <div
            className="pointer-events-none absolute h-3.5 w-2 -translate-x-1/2 rounded-xs bg-[#FB5F16]"
            style={{ left: `${(value / 10) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export const Launch = () => {
  const { address } = useConnection()
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 链上状态与方法
  const { formattedFee } = useCreationFee()
  const {
    execute: createToken,
    isLoading: isTxLoading,
    isSigning,
    isConfirming,
    isSuccess,
    tokenAddress,
    txHash,
    error: txError,
  } = useCreateToken()

  // 表单状态管理
  const form = useForm({
    defaultValues: {
      name: '',
      symbol: '',
      description: '',
      feeRecipient: address ?? '',
      buyTax: 0,
      sellTax: 0,
      taxDuration: '30',
      antiFarmerDuration: '30',
      links: {
        telegram: '',
        twitter: '',
        github: '',
        youtube: '',
        debox: '',
        website: '',
      },
    },
    onSubmit: async ({ value }) => {
      try {
        await createToken({
          name: value.name,
          symbol: value.symbol,
          meta: value.description,
          buyTax: value.buyTax,
          sellTax: value.sellTax,
          feeRecipient: value.feeRecipient as Hex,
          taxDurationDays: Number(value.taxDuration),
          antiFarmerDurationDays: Number(value.antiFarmerDuration),
        })
      } catch {
        // 错误已通过 hook 的 error 状态展示
      }
    },
  })

  // 钱包连接状态变化且表单尚未填入地址时，自动回显钱包地址
  useEffect(() => {
    if (address && !form.getFieldValue('feeRecipient')) {
      form.setFieldValue('feeRecipient', address)
    }
  }, [address, form])

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      setLogoPreview(url)
    }
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
      <div className="flex items-center gap-3 mb-4">
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
            className="w-full h-full object-cover"
          />
        </button>
        <span className="text-lg font-semibold text-white tracking-wide">
          创建代币
        </span>
      </div>

      <div className="flex flex-col rounded border border-[#484b51] bg-[#131516]">
        <div className="flex items-center justify-between border-b border-b-[#484b51] p-4">
          <div>
            <div className="text-xs font-bold text-white">
              保留您的代币 CA
            </div>
            <div className="mt-0.5 text-xs text-neutral-500">
              在发布前锁定您的代币合约的地址。
            </div>
          </div>
          <Link
            to="/prelaunch"
            className="flex items-center justify-center rounded border border-[#FE810B] px-2.5 py-1.5 text-xs font-bold text-[#FE810B] transition-colors hover:bg-[#FE810B]/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B]"
          >
            保留 CA →
          </Link>
        </div>

        <div className="flex flex-col space-y-10 p-4">
          <div className="flex flex-col gap-6">
            <SectionHeader title="基本信息" />

            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                type="button"
                aria-label="上传代币 Logo"
                onClick={() => fileInputRef.current?.click()}
                className="group relative flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-neutral-700 bg-[#111111] transition-colors hover:border-[#FE810B] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B]"
              >
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="代币 Logo 预览"
                    width={80}
                    height={80}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={uploadIcon}
                    alt=""
                    aria-hidden="true"
                    width={28}
                    height={28}
                    className="h-7 w-7 opacity-70 transition-opacity group-hover:opacity-100"
                  />
                )}
              </button>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#FB5F16]">
                  // 支持的文件格式
                </span>
                <span className="mt-1 text-xs leading-relaxed text-neutral-500">
                  PNG、JPEG、SVG、GIF、文件大小限制 3&nbsp;MB
                </span>
              </div>
            </div>

            <form.Field
              name="name"
              validators={{ onMount: nameSchema, onChange: nameSchema }}
            >
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-0.5">
                    <label
                      htmlFor={field.name}
                      className="text-sm text-white"
                    >
                      代币名称
                    </label>
                    <span className="text-xs text-[#f7594b]">*</span>
                  </div>
                  <input
                    id={field.name}
                    name={field.name}
                    type="text"
                    placeholder=""
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={24}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) =>
                      field.handleChange(e.target.value.slice(0, 24))
                    }
                    className="w-full h-10.5 px-3 text-sm border border-[#84888c] bg-transparent rounded-xs text-white placeholder:text-[#84888c] file:border-0 file:bg-transparent focus-visible:outline-none focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-[#FE810B] disabled:cursor-not-allowed disabled:opacity-50 box-border appearance-none"
                  />
                </div>
              )}
            </form.Field>

            <form.Field
              name="symbol"
              validators={{ onMount: symbolSchema, onChange: symbolSchema }}
            >
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-0.5">
                    <label
                      htmlFor={field.name}
                      className="text-sm text-white"
                    >
                      代币符號
                    </label>
                    <span className="text-xs text-[#f7594b]">*</span>
                  </div>
                  <input
                    id={field.name}
                    name={field.name}
                    type="text"
                    placeholder=""
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={15}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) =>
                      field.handleChange(e.target.value.slice(0, 15))
                    }
                    className="w-full h-10.5 px-3 text-sm border border-[#84888c] bg-transparent rounded-xs text-white placeholder:text-[#84888c] file:border-0 file:bg-transparent focus-visible:outline-none focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-[#FE810B] disabled:cursor-not-allowed disabled:opacity-50 box-border appearance-none"
                  />
                </div>
              )}
            </form.Field>

            <form.Field
              name="description"
              validators={{
                onChange: z.string().max(500, '描述最多 500 个字符'),
              }}
            >
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={field.name} className="text-sm text-white">
                    代币描述
                  </label>
                  <textarea
                    id={field.name}
                    name={field.name}
                    placeholder=""
                    autoComplete="off"
                    spellCheck={false}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    rows={4}
                    className="w-full resize-none p-3 min-h-30 text-sm border border-[#84888c] bg-transparent rounded-xs text-white placeholder:text-[#84888c] file:border-0 file:bg-transparent focus-visible:outline-none focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-[#FE810B] disabled:cursor-not-allowed disabled:opacity-50 box-border appearance-none"
                  />
                </div>
              )}
            </form.Field>
          </div>

          <div className="flex flex-col gap-6">
            <SectionHeader title="税率设置" />
            <form.Field
              name="buyTax"
              validators={{
                onChange: z.number().min(0).max(10, '买入税率最多 10%'),
              }}
            >
              {(field) => (
                <TaxSlider
                  label="买入税率"
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
            <form.Field
              name="sellTax"
              validators={{
                onChange: z.number().min(0).max(10, '卖出税率最多 10%'),
              }}
            >
              {(field) => (
                <TaxSlider
                  label="卖出税率"
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          </div>

          <div className="flex flex-col">
            <SectionHeader title="税费存续期" required />
            <form.Field
              name="taxDuration"
              validators={{
                onMount: taxDurationSchema,
                onChange: taxDurationSchema,
              }}
            >
              {(field) => {
                const errorMsg = field.state.meta.errors
                  .map((e) =>
                    typeof e === 'string'
                      ? e
                      : (e as { message?: unknown }).message,
                  )
                  .filter((m): m is string => typeof m === 'string')
                  .join(', ')
                return (
                  <div className="flex flex-col mt-4">
                    <NumericInput
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      title="设置税费存续期"
                      description="税费生效的总天数，期满后买卖税率永久归零"
                      unit="天"
                      min={1}
                      max={365}
                      presets={[
                        { label: '7天', value: 7 },
                        { label: '14天', value: 14 },
                        { label: '30天', value: 30 },
                        { label: '90天', value: 90 },
                        { label: '180天', value: 180 },
                        { label: '365天', value: 365 },
                      ]}
                    />
                    {errorMsg && (
                      <p className="self-stretch text-xs text-red-500 mt-1">
                        {errorMsg}
                      </p>
                    )}
                  </div>
                )
              }}
            </form.Field>
            <p className="text-xs text-[#84888c] mt-2">
              税费存续期是指代币交易税费生效的总天数。期满后，代币的买入与卖出税率将永久归零。
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <SectionHeader title="税费接收地址" required />
            <form.Field
              name="feeRecipient"
              validators={{
                onMount: evmAddressSchema,
                onChange: evmAddressSchema,
              }}
            >
              {(field) => {
                const errorMsg = field.state.meta.errors
                  .map((e) =>
                    typeof e === 'string'
                      ? e
                      : (e as { message?: unknown }).message,
                  )
                  .filter((m): m is string => typeof m === 'string')
                  .join(', ')
                const showError =
                  Boolean(errorMsg) &&
                  (field.state.meta.isTouched ||
                    field.state.value.trim().length > 0)

                return (
                  <div className="flex flex-col">
                    <input
                      id={field.name}
                      name={field.name}
                      type="text"
                      aria-label="税费接收地址"
                      placeholder=""
                      autoComplete="off"
                      spellCheck={false}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="w-full h-10.5 px-3 text-sm border border-[#84888c] bg-transparent rounded-xs text-white placeholder:text-[#84888c] file:border-0 file:bg-transparent focus-visible:outline-none focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-[#FE810B] disabled:cursor-not-allowed disabled:opacity-50 box-border appearance-none"
                    />
                    {showError && (
                      <p className="text-xs text-red-500 mt-1">{errorMsg}</p>
                    )}
                  </div>
                )
              }}
            </form.Field>
          </div>

          <div className="flex flex-col">
            <SectionHeader title="防「挖、提、卖」保护期" required />
            <form.Field
              name="antiFarmerDuration"
              validators={{ onChange: antiFarmerDurationSchema }}
            >
              {(field) => {
                const errorMsg = field.state.meta.errors
                  .map((e) =>
                    typeof e === 'string'
                      ? e
                      : (e as { message?: unknown }).message,
                  )
                  .filter((m): m is string => typeof m === 'string')
                  .join(', ')
                return (
                  <div className="flex flex-col mt-4">
                    <NumericInput
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      title="设置防「挖、提、卖」保护期"
                      description="保护期内禁止向部分 V3 池添加流动性，设为 0 天则不启用"
                      unit="天"
                      min={0}
                      max={365}
                      presets={[
                        { label: '0天 (不启用)', value: 0 },
                        { label: '7天', value: 7 },
                        { label: '14天', value: 14 },
                        { label: '30天', value: 30 },
                        { label: '90天', value: 90 },
                      ]}
                    />
                    {errorMsg && (
                      <p className="self-stretch text-xs text-red-500 mt-1">
                        {errorMsg}
                      </p>
                    )}
                  </div>
                )
              }}
            </form.Field>
            <p className="text-xs text-[#84888c] mt-2">
              在防「挖、提、卖」保护期内，用户将无法向部分 V3
              流动性池添加流动性，该功能的作用是在保护期内保证交易尽量发生在税收流动性池，提高代币税收收入的稳定性。设为
              0 天则不启用保护期。
            </p>
          </div>

          <div className="flex flex-col">
            <SectionHeader title="可选链接" />
            <div className="flex flex-col gap-6 mt-6">
              {linkFields.map((item) => (
                <form.Field
                  key={item.key}
                  name={`links.${item.key}`}
                  validators={{ onChange: optionalUrl }}
                >
                  {(field) => (
                    <div className="flex flex-col">
                      <label
                        htmlFor={field.name}
                        className="text-sm text-white mb-2"
                      >
                        {item.label}
                      </label>
                      <input
                        id={field.name}
                        name={field.name}
                        type="url"
                        inputMode="url"
                        placeholder=""
                        autoComplete="off"
                        spellCheck={false}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="w-full h-10.5 px-3 text-sm border border-[#84888c] bg-transparent rounded-xs text-white placeholder:text-[#84888c] file:border-0 file:bg-transparent focus-visible:outline-none focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-[#FE810B] disabled:cursor-not-allowed disabled:opacity-50 box-border appearance-none"
                      />
                    </div>
                  )}
                </form.Field>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-t-white/10 bg-[#131516] p-4">
        <form.Subscribe
          selector={(state) => ({
            canSubmit:
              state.isValid &&
              !state.isSubmitting &&
              !isTxLoading &&
              Boolean(address),
            isSubmitting: state.isSubmitting || isTxLoading,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <>
              {formattedFee && (
                <div className="mb-2 flex items-center justify-between text-xs text-neutral-400">
                  <span>创建费用：</span>
                  <span className="font-semibold text-white">
                    {formattedFee} BNB
                  </span>
                </div>
              )}

              {txError && (
                <p className="mb-2 text-xs text-red-500 font-medium">
                  {txError}
                </p>
              )}

              {isSuccess && tokenAddress && (
                <div className="mb-3 rounded border border-green-500/30 bg-green-500/10 p-3 text-xs text-green-400">
                  <p className="font-semibold mb-1">🎉 代币创建成功！</p>
                  <div className="flex items-center gap-1">
                    <span>代币地址：</span>
                    <a
                      href={`https://testnet.bscscan.com/address/${tokenAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline inline-flex items-center gap-0.5 font-mono text-white hover:text-[#FFA546]"
                    >
                      {tokenAddress}
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                  {txHash && (
                    <div className="flex items-center gap-1 mt-1 text-neutral-400">
                      <span>交易哈希：</span>
                      <a
                        href={`https://testnet.bscscan.com/tx/${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline inline-flex items-center gap-0.5 font-mono hover:text-white"
                      >
                        {txHash.slice(0, 10)}...{txHash.slice(-8)}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {isSigning && (
                <p className="mb-2 text-xs text-[#FFA546]">
                  请在钱包中确认签名…
                </p>
              )}

              {isConfirming && (
                <p className="mb-2 text-xs text-[#FFA546]">
                  交易已提交，等待区块确认中…
                </p>
              )}

              {!address && (
                <p className="mb-2 text-xs text-neutral-400">
                  请先连接钱包后再创建代币
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/60 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-base font-bold text-white shadow-[0_3px_0_0_#963000] transition-[transform,opacity] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFA546]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-5 animate-spin" />
                    <span>
                      {isSigning
                        ? '等待钱包确认…'
                        : isConfirming
                          ? '区块确认中…'
                          : '创建中…'}
                    </span>
                  </>
                ) : (
                  <span>创建代币</span>
                )}
              </button>
            </>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
