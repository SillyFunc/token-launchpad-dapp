import { useEffect, useMemo, useState, useRef, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { isAddress } from 'viem'
import { useConfig, useConnection } from 'wagmi'
import { ArrowRight } from 'lucide-react'

import { FormSectionTitle } from '@/components/common/form-section-title'
import { FormInput } from '@/components/common/form-input'
import { TaxSlider } from '@/components/common/tax-slider'
import { FieldInfo } from '@/components/common/field-info'
import { Web3ActionButton } from '@/components/common/web3-action-button'
import {
  ReservedAddressSelect,
  useReservedAddressOptions,
  type ReservedAddressOption,
} from '@/components/launch/reserved-address-select'
import { toast } from '@/components/ui/toast'
import titleBackArrow from '@/assets/icons/back-arrow.svg'
import {
  saveTokenInfo,
  updateTokenInfo,
  uploadTokenLogo,
  type TokenDetail,
} from '@/api/token'
import { requestAuthSignature } from '@/api/auth'
import { findVanitySalt } from '@/lib/vanity-salt'

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
  .min(1, '请输入收税时长')
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

// 天数输入清洗：仅保留数字、去前导零；最多 3 位对应 365 上限
const sanitizeDaysInput = (raw: string) =>
  raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 3)

const evmAddressSchema = z
  .string()
  .trim()
  .min(1, '请输入税费接收地址')
  .refine((val) => !val || isAddress(val), '请输入合法的 EVM 地址')

const linkFields = [
  { label: 'Telegram 链接', key: 'telegram' },
  { label: 'Twitter 链接', key: 'twitter' },
  { label: '网站链接', key: 'website' },
] as const

export interface LaunchFormProps {
  initialData?: TokenDetail | null
  editId?: string | null
}

export function LaunchForm({ initialData, editId }: LaunchFormProps) {
  const isEditMode = Boolean(editId && initialData)
  const navigate = useNavigate()
  const { address } = useConnection()
  const config = useConfig()
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(
    initialData?.coinImg || null,
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 草稿保存的盐若是某个预留地址的盐，编辑时预选该地址；否则视为自动生成的盐
  const { data: reservedOptions } = useReservedAddressOptions()
  const initialReservedAddress = useMemo(
    () =>
      (initialData?.salt &&
        reservedOptions?.find((item) => item.salt === initialData.salt)) ||
      null,
    [initialData?.salt, reservedOptions],
  )

  // 预览用 objectURL，组件卸载时释放
  useEffect(
    () => () => {
      if (logoPreview && logoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreview)
      }
    },
    [logoPreview],
  )

  // 表单状态管理：以 initialData 真实数据完整初始化；
  // 预留列表异步到达后 defaultValues 变化，TanStack Form 会在表单未被触碰时同步进来
  const form = useForm({
    defaultValues: {
      name: initialData?.name ?? '',
      symbol: initialData?.symbol ?? '',
      description: initialData?.meta || initialData?.zhIntroduction || '',
      feeRecipient: initialData?.feeRecipient || address || '',
      buyTax: initialData?.buyTax ?? 0,
      sellTax: initialData?.sellTax ?? 0,
      taxDuration: String(initialData?.taxDuration ?? '30'),
      antiFarmerDuration: String(initialData?.antiFarmerDuration ?? '0'),
      reservedAddress: initialReservedAddress as ReservedAddressOption | null,
      links: {
        telegram: initialData?.telegram ?? '',
        twitter: initialData?.twitter ?? '',
        website: initialData?.website ?? '',
      },
    },
    onSubmit: async ({ value }) => {
      if (!isEditMode && !logoFile) {
        toast.error('请上传代币 Logo')
        return
      }
      if (isEditMode && !logoFile && !logoPreview) {
        toast.error('请上传代币 Logo')
        return
      }
      if (!address) return

      try {
        // 平台代币地址强制 8888 尾号：保存前确定盐值，随表单交由后端保存；
        // 搜盐失败必须终止保存（不发请求、不唤起签名），避免落库的代币无法对齐链上地址。
        // 选择了预留地址则使用其锁定时的盐（链上 NotReserver 校验要求原盐）；
        // 编辑模式下代币尚未上链，同样允许更换：未选预留时若草稿原盐属于自动生成则沿用，
        // 若原盐是某个预留地址的盐（用户刚取消选择）则必须重新生成，否则会误占预留地址。
        const isCurrentReservedAddress =
          isEditMode &&
          value.reservedAddress &&
          ((initialData?.salt &&
            value.reservedAddress.salt.toLowerCase() ===
              String(initialData.salt).toLowerCase()) ||
            (initialData?.coinContractAddress &&
              value.reservedAddress.address.toLowerCase() ===
                String(initialData.coinContractAddress).toLowerCase()))

        if (
          value.reservedAddress &&
          value.reservedAddress.coinStatus !== 0 &&
          !isCurrentReservedAddress
        ) {
          toast.error('所选预留地址不可用，请重新选择')
          return
        }
        let createSalt: string | undefined
        if (value.reservedAddress) {
          createSalt = value.reservedAddress.salt
        } else if (
          isEditMode &&
          initialData?.salt &&
          !reservedOptions?.some((item) => item.salt === initialData.salt)
        ) {
          createSalt = initialData.salt
        } else {
          try {
            createSalt = (await findVanitySalt()).salt
          } catch {
            toast.error('盐值计算失败，请重试')
            return
          }
        }

        let coinImg = logoPreview ?? ''
        if (logoFile) {
          coinImg = await uploadTokenLogo(logoFile)
        }
        const auth = await requestAuthSignature(config, address)

        if (isEditMode && editId) {
          await updateTokenInfo({
            id: editId,
            name: value.name.trim(),
            coinImg,
            symbol: value.symbol.trim(),
            meta: value.description.trim(),
            buyTax: Number(value.buyTax),
            sellTax: Number(value.sellTax),
            feeRecipient: value.feeRecipient.trim(),
            taxDuration: Number(value.taxDuration),
            antiFarmerDuration: Number(value.antiFarmerDuration),
            liqExpectedOutputAmount: 0,
            launchType: initialData?.launchType || 2,
            website: value.links.website?.trim() ?? '',
            telegram: value.links.telegram?.trim() ?? '',
            twitter: value.links.twitter?.trim() ?? '',
            salt: createSalt,
            ...(value.reservedAddress
              ? { coinContractAddress: value.reservedAddress.address }
              : {}),
            ...auth,
          })
          toast.success('代币信息修改已保存！')
        } else {
          await saveTokenInfo({
            name: value.name.trim(),
            coinImg,
            symbol: value.symbol.trim(),
            meta: value.description.trim(),
            buyTax: Number(value.buyTax),
            sellTax: Number(value.sellTax),
            feeRecipient: value.feeRecipient.trim(),
            taxDuration: Number(value.taxDuration),
            antiFarmerDuration: Number(value.antiFarmerDuration),
            liqExpectedOutputAmount: 0,
            launchType: 2,
            website: value.links.website?.trim() ?? '',
            telegram: value.links.telegram?.trim() ?? '',
            twitter: value.links.twitter?.trim() ?? '',
            salt: createSalt,
            ...(value.reservedAddress
              ? { coinContractAddress: value.reservedAddress.address }
              : {}),
            ...auth,
          })
          toast.success('创建成功！')
        }

        navigate('/dashboard')
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : isEditMode
              ? '修改代币信息失败，请稍后重试'
              : '创建失败，请稍后重试'
        toast.error(msg)
      }
    },
  })

  // 处理 Logo 上传选择
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('请选择有效的图片文件')
      return
    }

    if (file.size > 3 * 1024 * 1024) {
      toast.error('图片大小不能超过 3MB')
      return
    }

    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  return (
    <form
      className="relative mx-auto flex w-full flex-col pb-28 pt-6"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          aria-label="返回"
          onClick={() => navigate('/')}
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
          {isEditMode ? '编辑代币信息' : '创建代币'}
        </span>
      </div>

      <div className="flex flex-col rounded border border-[#484b51] bg-[#131516]">
        <div className="flex items-center justify-between gap-3 border-b border-b-[#484b51] p-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white">保留您的代币 CA</div>
            <div className="mt-1 text-xs text-neutral-500">
              在发布前锁定您的代币合约的地址。
            </div>
          </div>
          <Link
            to="/prelaunch"
            className="flex shrink-0 items-center justify-center whitespace-nowrap rounded border border-[#ffd98c] px-4 py-2 text-xs font-semibold text-[#ffd98c] transition-colors hover:bg-[#ffd98c] hover:text-black sm:px-6 sm:py-2.5"
          >
            <span>保留 CA</span>
            <ArrowRight className="ml-1.5 size-3 shrink-0" />
          </Link>
        </div>

        <div className="flex flex-col space-y-10 p-4">
          <div className="flex flex-col gap-6">
            <FormSectionTitle title="基本信息" />

            <div className="flex items-center gap-4">
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
                className="group text-[#84888c] hover:text-white transition-colors relative isolate flex h-25 w-25 shrink-0 cursor-pointer flex-col items-center justify-center"
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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 200 200"
                    fill="none"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    className="absolute inset-0 -z-10"
                  >
                    <rect
                      x="0.5"
                      y="0.5"
                      width="199"
                      height="199"
                      rx="3.5"
                      stroke="currentColor"
                    ></rect>
                    <path
                      d="M12 172L12 188L28 188"
                      stroke="currentColor"
                    ></path>
                    <path
                      d="M172 188L188 188L188 172"
                      stroke="currentColor"
                    ></path>
                    <path d="M28 12L12 12L12 28" stroke="currentColor"></path>
                    <path
                      d="M188 28L188 12L172 12"
                      stroke="currentColor"
                    ></path>
                    <path
                      d="M94.3333 130H76.6667C74.8986 130 73.2029 129.298 71.9526 128.047C70.7024 126.797 70 125.101 70 123.333V76.6667C70 74.8986 70.7024 73.2029 71.9526 71.9526C73.2029 70.7024 74.8986 70 76.6667 70H123.333C125.101 70 126.797 70.7024 128.047 71.9526C129.298 73.2029 130 74.8986 130 76.6667V110L119.667 99.6667C118.412 98.4373 116.723 97.7525 114.967 97.7613C113.211 97.77 111.529 98.4715 110.287 99.7133L80 130"
                      stroke="#FE810B"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    ></path>
                    <path
                      d="M106.668 125L116.668 115L126.668 125"
                      stroke="#FE810B"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    ></path>
                    <path
                      d="M116.668 133.333V115"
                      stroke="#FE810B"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    ></path>
                    <path
                      d="M89.9987 96.6668C93.6806 96.6668 96.6654 93.6821 96.6654 90.0002C96.6654 86.3183 93.6806 83.3335 89.9987 83.3335C86.3168 83.3335 83.332 86.3183 83.332 90.0002C83.332 93.6821 86.3168 96.6668 89.9987 96.6668Z"
                      stroke="#FE810B"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    ></path>
                  </svg>
                )}
              </button>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-[#FB5F16]">
                  // 支持的文件格式
                </span>
                <span className="mt-4 text-xs leading-relaxed text-[#a0a3a7]">
                  PNG、JPEG、SVG、GIF、文件大小
                  <br />
                  限制 3&nbsp;MB
                </span>
              </div>
            </div>

            <form.Field name="reservedAddress">
              {(field) => (
                <ReservedAddressSelect
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                />
              )}
            </form.Field>

            <form.Field
              name="name"
              validators={{ onMount: nameSchema, onChange: nameSchema }}
            >
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-0.5">
                    <label htmlFor={field.name} className="text-sm text-white">
                      代币名称
                    </label>
                    <span className="text-xs text-[#f7594b]">*</span>
                  </div>
                  <FormInput
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
                    <label htmlFor={field.name} className="text-sm text-white">
                      代币符號
                    </label>
                    <span className="text-xs text-[#f7594b]">*</span>
                  </div>
                  <FormInput
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
                    className="box-border min-h-30 w-full appearance-none resize-none rounded-xs border border-[#84888c] bg-transparent p-3 text-sm text-white placeholder:text-[#84888c] focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              )}
            </form.Field>
          </div>

          <div className="flex flex-col gap-6">
            <FormSectionTitle title="税率设置" />
            <form.Field
              name="buyTax"
              validators={{
                onChange: z.number().min(0).max(10, '买入税率最多 10%'),
              }}
            >
              {(field) => (
                <TaxSlider
                  label="买入税率"
                  required
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
                  required
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          </div>

          <div className="flex flex-col">
            <FormSectionTitle title="收税时长" required />
            <form.Field
              name="taxDuration"
              validators={{
                onMount: taxDurationSchema,
                onChange: taxDurationSchema,
              }}
            >
              {(field) => (
                <div className="flex flex-col mt-4">
                  <FormInput
                    id={field.name}
                    name={field.name}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) =>
                      field.handleChange(sanitizeDaysInput(e.target.value))
                    }
                    rightAdornment="天"
                  />
                  <FieldInfo field={field} />
                </div>
              )}
            </form.Field>
            <p className="text-xs text-[#84888c] mt-2">
              收税时长是指代币交易税费生效的总天数。期满后，代币的买入与卖出税率将永久归零。
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <FormSectionTitle title="税费接收地址" required />
            <form.Field
              name="feeRecipient"
              validators={{ onChange: evmAddressSchema }}
            >
              {(field) => (
                <div className="flex flex-col">
                  <FormInput
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
                  />
                  <FieldInfo field={field} />
                </div>
              )}
            </form.Field>
          </div>

          <div className="flex flex-col">
            <FormSectionTitle title="防「挖、提、卖」保护期" required />
            <form.Field
              name="antiFarmerDuration"
              validators={{
                onChangeListenTo: ['taxDuration'],
                onChange: ({ value, fieldApi }) => {
                  const result = antiFarmerDurationSchema.safeParse(value)
                  if (!result.success) {
                    return result.error.issues[0]?.message
                  }

                  const taxDuration = Number(
                    fieldApi.form.getFieldValue('taxDuration'),
                  )
                  if (
                    Number.isInteger(taxDuration) &&
                    taxDuration >= 1 &&
                    taxDuration <= 365 &&
                    Number(value) > taxDuration
                  ) {
                    return '防「挖、提、卖」保护期不能超过收税时长'
                  }

                  return undefined
                },
              }}
            >
              {(field) => (
                <div className="flex flex-col mt-4">
                  <FormInput
                    id={field.name}
                    name={field.name}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) =>
                      field.handleChange(sanitizeDaysInput(e.target.value))
                    }
                    rightAdornment="天"
                  />
                  <FieldInfo field={field} />
                </div>
              )}
            </form.Field>
            <p className="text-xs text-[#84888c] mt-2">
              在防「挖、提、卖」保护期内，用户将无法向部分 V3
              流动性池添加流动性，该功能的作用是在保护期内保证交易尽量发生在税收流动性池，提高代币税收收入的稳定性。设为
              0 天则不启用保护期。
            </p>
          </div>

          <div className="flex flex-col">
            <FormSectionTitle title="可选链接" />
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
                      <FormInput
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
            canSubmit: state.isValid && !state.isSubmitting,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Web3ActionButton
              type="submit"
              disabled={!canSubmit}
              loading={isSubmitting}
              loadingText={isEditMode ? '保存中…' : '创建中…'}
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-base font-bold text-white [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] transition-[transform,opacity] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFA546]"
            >
              <span>{isEditMode ? '保存修改' : '创建代币'}</span>
            </Web3ActionButton>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
