import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { useConnection, useConfig } from 'wagmi'
import { signMessage } from '@wagmi/core'
import { isAddress } from 'viem'
import { Coins, Edit3, Loader2 } from 'lucide-react'

import {
  updateTokenInfo,
  uploadTokenLogo,
  type TokenDetail,
} from '@/api/token'
import { getSignMessage } from '@/api/auth'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

const optionalUrl = z.union([
  z.literal(''),
  z.string().url('请输入合法的 URL').or(z.literal('')),
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
  .refine((val) => isAddress(val), '请输入合法的 EVM 地址')

export interface EditTokenModalProps {
  token: TokenDetail
  onClose: () => void
  onSuccess: () => void
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return ''
}

export function EditTokenModal({
  token,
  onClose,
  onSuccess,
}: EditTokenModalProps) {
  const { address } = useConnection()
  const config = useConfig()

  // Logo 上传状态
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(
    token.coinImg || null,
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(
    () => () => {
      if (logoPreview && logoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreview)
      }
    },
    [logoPreview],
  )

  const form = useForm({
    defaultValues: {
      name: token.name ?? '',
      symbol: token.symbol ?? '',
      description: token.meta ?? token.zhIntroduction ?? '',
      buyTax: token.buyTax ?? 0,
      sellTax: token.sellTax ?? 0,
      taxDuration: String(token.taxDuration ?? '30'),
      antiFarmerDuration: String(token.antiFarmerDuration ?? '0'),
      feeRecipient: token.feeRecipient || address || '',
      links: {
        telegram: token.telegram ?? '',
        twitter: token.twitter ?? '',
        website: token.website ?? '',
      },
    },
    onSubmit: async ({ value }) => {
      if (!address) {
        toast.add({ description: '请先连接钱包', type: 'error' })
        return
      }

      try {
        let coinImg = token.coinImg || ''
        if (logoFile) {
          coinImg = await uploadTokenLogo(logoFile)
        }
        const message = await getSignMessage(address)
        const signature = await signMessage(config, { message })
        await updateTokenInfo({
          id: token.id,
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
          launchType: token.launchType || 2,
          website: value.links.website?.trim() ?? '',
          telegram: value.links.telegram?.trim() ?? '',
          twitter: value.links.twitter?.trim() ?? '',
          address,
          message,
          signature,
        })
        toast.add({ description: '代币信息修改已保存！', type: 'success' })
        onSuccess()
        setTimeout(() => {
          onClose()
        }, 600)
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : '保存修改失败，请稍后重试'
        toast.add({ description: msg, type: 'error' })
      }
    },
  })

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) {
      toast.add({ description: 'Logo 文件大小不能超过 3 MB', type: 'error' })
      return
    }
    if (logoPreview && logoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(logoPreview)
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-md flex-col overflow-hidden border border-[#484b51] bg-[#131516] p-0 text-white shadow-2xl">
        <DialogHeader className="border-b border-[#2F3737] px-5 py-4">
          <div className="flex items-center gap-2">
            <Edit3 className="size-4 text-[#FE810B]" />
            <DialogTitle className="text-base font-bold text-white">
              编辑代币信息
            </DialogTitle>
          </div>
          <DialogDescription className="mt-1 text-xs text-neutral-400">
            修改 {token.name} ({token.symbol}) 的基本资料与合约参数
          </DialogDescription>
        </DialogHeader>

        {/* TanStack Form 表单区 */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void form.handleSubmit()
          }}
          className="flex flex-1 flex-col space-y-4 overflow-y-auto px-5 py-4"
        >
          {/* Logo 与基本名称行 */}
          <div className="flex items-start gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group relative flex size-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-[#484b51] bg-[#1a1c1e] transition-colors hover:border-[#FE810B]"
              >
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <Coins className="size-6 text-[#FE810B]" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                  更换
                </span>
              </button>
            </div>

            <div className="grid flex-1 grid-cols-2 gap-2">
              <form.Field
                name="name"
                validators={{ onMount: nameSchema, onChange: nameSchema }}
              >
                {(field) => {
                  const error = field.state.meta.errors
                    .map(getErrorMessage)
                    .filter(Boolean)
                    .join(', ')
                  return (
                    <div className="flex flex-col gap-1">
                      <label htmlFor={field.name} className="text-xs text-neutral-400">
                        代币名称 *
                      </label>
                      <input
                        id={field.name}
                        name={field.name}
                        type="text"
                        maxLength={24}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value.slice(0, 24))}
                        className="h-8 w-full rounded-xs border border-[#484b51] bg-[#1a1c1e] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
                      />
                      {field.state.meta.isTouched && error && (
                        <span className="text-[10px] text-red-500">{error}</span>
                      )}
                    </div>
                  )
                }}
              </form.Field>

              <form.Field
                name="symbol"
                validators={{ onMount: symbolSchema, onChange: symbolSchema }}
              >
                {(field) => {
                  const error = field.state.meta.errors
                    .map(getErrorMessage)
                    .filter(Boolean)
                    .join(', ')
                  return (
                    <div className="flex flex-col gap-1">
                      <label htmlFor={field.name} className="text-xs text-neutral-400">
                        代币符号 *
                      </label>
                      <input
                        id={field.name}
                        name={field.name}
                        type="text"
                        maxLength={15}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value.slice(0, 15))}
                        className="h-8 w-full rounded-xs border border-[#484b51] bg-[#1a1c1e] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
                      />
                      {field.state.meta.isTouched && error && (
                        <span className="text-[10px] text-red-500">{error}</span>
                      )}
                    </div>
                  )
                }}
              </form.Field>
            </div>
          </div>

          {/* 代币描述 */}
          <form.Field
            name="description"
            validators={{
              onChange: z.string().max(500, '描述最多 500 个字符'),
            }}
          >
            {(field) => (
              <div className="flex flex-col gap-1">
                <label htmlFor={field.name} className="text-xs text-neutral-400">
                  代币描述
                </label>
                <textarea
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="请输入代币描述..."
                  className="w-full resize-none rounded-xs border border-[#484b51] bg-[#1a1c1e] p-2.5 text-xs text-white placeholder:text-neutral-600 focus:border-[#FE810B] focus:outline-none"
                />
              </div>
            )}
          </form.Field>

          {/* 税率与期限参数（紧凑网格） */}
          <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-[#2F3737] bg-[#17191b] p-3">
            <form.Field
              name="buyTax"
              validators={{
                onChange: z.number().min(0).max(10, '买入税率最多 10%'),
              }}
            >
              {(field) => (
                <div className="flex flex-col gap-1">
                  <label htmlFor={field.name} className="text-xs text-neutral-400">
                    买入税率 (%)
                  </label>
                  <input
                    id={field.name}
                    name={field.name}
                    type="number"
                    min={0}
                    max={10}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(Number(e.target.value))}
                    className="h-8 w-full rounded-xs border border-[#484b51] bg-[#141517] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
                  />
                </div>
              )}
            </form.Field>

            <form.Field
              name="sellTax"
              validators={{
                onChange: z.number().min(0).max(10, '卖出税率最多 10%'),
              }}
            >
              {(field) => (
                <div className="flex flex-col gap-1">
                  <label htmlFor={field.name} className="text-xs text-neutral-400">
                    卖出税率 (%)
                  </label>
                  <input
                    id={field.name}
                    name={field.name}
                    type="number"
                    min={0}
                    max={10}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(Number(e.target.value))}
                    className="h-8 w-full rounded-xs border border-[#484b51] bg-[#141517] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
                  />
                </div>
              )}
            </form.Field>

            <form.Field
              name="taxDuration"
              validators={{
                onMount: taxDurationSchema,
                onChange: taxDurationSchema,
              }}
            >
              {(field) => {
                const error = field.state.meta.errors
                  .map(getErrorMessage)
                  .filter(Boolean)
                  .join(', ')
                return (
                  <div className="flex flex-col gap-1">
                    <label htmlFor={field.name} className="text-xs text-neutral-400">
                      税费存续期 (天)
                    </label>
                    <input
                      id={field.name}
                      name={field.name}
                      type="number"
                      min={1}
                      max={365}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="h-8 w-full rounded-xs border border-[#484b51] bg-[#141517] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
                    />
                    {field.state.meta.isTouched && error && (
                      <span className="text-[10px] text-red-500">{error}</span>
                    )}
                  </div>
                )
              }}
            </form.Field>

            <form.Field
              name="antiFarmerDuration"
              validators={{ onChange: antiFarmerDurationSchema }}
            >
              {(field) => {
                const error = field.state.meta.errors
                  .map(getErrorMessage)
                  .filter(Boolean)
                  .join(', ')
                return (
                  <div className="flex flex-col gap-1">
                    <label htmlFor={field.name} className="text-xs text-neutral-400">
                      防挖保护期 (天)
                    </label>
                    <input
                      id={field.name}
                      name={field.name}
                      type="number"
                      min={0}
                      max={365}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="h-8 w-full rounded-xs border border-[#484b51] bg-[#141517] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
                    />
                    {field.state.meta.isTouched && error && (
                      <span className="text-[10px] text-red-500">{error}</span>
                    )}
                  </div>
                )
              }}
            </form.Field>
          </div>

          {/* 税费接收地址 */}
          <form.Field
            name="feeRecipient"
            validators={{
              onMount: evmAddressSchema,
              onChange: evmAddressSchema,
            }}
          >
            {(field) => {
              const error = field.state.meta.errors
                .map(getErrorMessage)
                .filter(Boolean)
                .join(', ')
              return (
                <div className="flex flex-col gap-1">
                  <label htmlFor={field.name} className="text-xs text-neutral-400">
                    税费接收地址 *
                  </label>
                  <input
                    id={field.name}
                    name={field.name}
                    type="text"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="0x..."
                    className="h-8 w-full rounded-xs border border-[#484b51] bg-[#1a1c1e] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
                  />
                  {field.state.meta.isTouched && error && (
                    <span className="text-[10px] text-red-500">{error}</span>
                  )}
                </div>
              )
            }}
          </form.Field>

          {/* 社交链接 */}
          <div className="space-y-2">
            <span className="text-xs text-neutral-400">社交链接</span>
            <div className="grid grid-cols-1 gap-2">
              <form.Field
                name="links.website"
                validators={{ onChange: optionalUrl }}
              >
                {(field) => {
                  const error = field.state.meta.errors
                    .map(getErrorMessage)
                    .filter(Boolean)
                    .join(', ')
                  return (
                    <div className="flex flex-col gap-0.5">
                      <input
                        id={field.name}
                        name={field.name}
                        type="url"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="官网链接 (https://...)"
                        className="h-8 w-full rounded-xs border border-[#484b51] bg-[#1a1c1e] px-2.5 text-xs text-white placeholder:text-neutral-600 focus:border-[#FE810B] focus:outline-none"
                      />
                      {field.state.meta.isTouched && error && (
                        <span className="text-[10px] text-red-500">{error}</span>
                      )}
                    </div>
                  )
                }}
              </form.Field>

              <form.Field
                name="links.twitter"
                validators={{ onChange: optionalUrl }}
              >
                {(field) => {
                  const error = field.state.meta.errors
                    .map(getErrorMessage)
                    .filter(Boolean)
                    .join(', ')
                  return (
                    <div className="flex flex-col gap-0.5">
                      <input
                        id={field.name}
                        name={field.name}
                        type="url"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Twitter 链接 (https://twitter.com/...)"
                        className="h-8 w-full rounded-xs border border-[#484b51] bg-[#1a1c1e] px-2.5 text-xs text-white placeholder:text-neutral-600 focus:border-[#FE810B] focus:outline-none"
                      />
                      {field.state.meta.isTouched && error && (
                        <span className="text-[10px] text-red-500">{error}</span>
                      )}
                    </div>
                  )
                }}
              </form.Field>

              <form.Field
                name="links.telegram"
                validators={{ onChange: optionalUrl }}
              >
                {(field) => {
                  const error = field.state.meta.errors
                    .map(getErrorMessage)
                    .filter(Boolean)
                    .join(', ')
                  return (
                    <div className="flex flex-col gap-0.5">
                      <input
                        id={field.name}
                        name={field.name}
                        type="url"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Telegram 链接 (https://t.me/...)"
                        className="h-8 w-full rounded-xs border border-[#484b51] bg-[#1a1c1e] px-2.5 text-xs text-white placeholder:text-neutral-600 focus:border-[#FE810B] focus:outline-none"
                      />
                      {field.state.meta.isTouched && error && (
                        <span className="text-[10px] text-red-500">{error}</span>
                      )}
                    </div>
                  )
                }}
              </form.Field>
            </div>
          </div>

          <DialogFooter className="flex flex-row items-center justify-end gap-2 border-t border-[#2F3737] pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="rounded border-[#484b51] bg-[#1a1c1e] text-xs text-neutral-300 hover:bg-[#25282c]"
            >
              取消
            </Button>
            <form.Subscribe
              selector={(state) => ({
                canSubmit: state.canSubmit && !state.isSubmitting,
                isSubmitting: state.isSubmitting,
              })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button
                  type="submit"
                  size="sm"
                  disabled={!canSubmit}
                  className="flex items-center gap-1.5 rounded border border-white/40 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white shadow-[0_2px_0_0_#963000] disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>保存中…</span>
                    </>
                  ) : (
                    '保存修改'
                  )}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
