import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useConnection } from 'wagmi'
import { Loader2, Coins } from 'lucide-react'

import { FormSectionTitle } from '@/components/common/form-section-title'
import { TaxSlider } from '@/components/common/tax-slider'
import { NumericInput } from '@/components/ui/numeric-keypad'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { formatAddress } from '@/lib/format'
import { getTokenByContractAddress } from '@/api/token'
import titleBackArrow from '@/assets/icons/back-arrow.svg'

export const Presale = () => {
  const [searchParams] = useSearchParams()
  const tokenAddress = searchParams.get('address') || ''
  const { address } = useConnection()

  const {
    data: token,
    isLoading: isTokenLoading,
    isError: isTokenError,
  } = useQuery({
    queryKey: ['tokenDetail', tokenAddress],
    queryFn: () => getTokenByContractAddress(tokenAddress),
    enabled: Boolean(tokenAddress),
  })

  const form = useForm({
    defaultValues: {
      hardcap: '',
      softcap: '',
      vestingDelay: '7',
      vestingRate: 10,
    },
    onSubmit: async () => {},
  })

  return (
    <form
      className="relative mx-auto flex w-full flex-col pb-28 pt-6"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <div className="mb-4 flex shrink-0 items-center gap-3">
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
        <span className="text-lg font-semibold tracking-wide text-white">
          创建代币
        </span>
      </div>

      <Card className="overflow-visible border border-[#484b51] bg-[#131516] ring-0">
        <CardHeader className="border-b border-b-[#484b51]">
          {isTokenLoading ? (
            <div className="flex items-center gap-3">
              <div className="size-10 animate-pulse rounded bg-[#2F3737]" />
              <div className="flex flex-col gap-1.5">
                <div className="h-3.5 w-24 animate-pulse rounded bg-[#2F3737]" />
                <div className="h-3 w-32 animate-pulse rounded bg-[#2F3737]" />
              </div>
            </div>
          ) : token ? (
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border border-[#484b51] bg-[#1a1c1e]">
                {token.coinImg ? (
                  <img
                    src={token.coinImg}
                    alt={token.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <Coins className="size-5 text-[#FFA546]" />
                )}
              </div>
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <CardTitle className="truncate text-sm font-bold text-white">
                    {token.name}
                  </CardTitle>
                  {token.symbol && (
                    <span className="shrink-0 rounded bg-[#FE810B]/15 px-1.5 py-0.5 text-xs font-semibold text-[#FFA546]">
                      {token.symbol}
                    </span>
                  )}
                </div>
                <CardDescription className="font-mono text-xs text-neutral-400">
                  CA: {formatAddress(tokenAddress)}
                </CardDescription>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold text-white">
                代币信息
              </CardTitle>
              <CardDescription className="text-xs text-neutral-400">
                {isTokenError ? '获取代币信息失败' : '未指定代币合约地址'}
              </CardDescription>
            </div>
          )}
        </CardHeader>

        <CardContent className="flex flex-col space-y-10 p-4">
          <div className="flex flex-col gap-6">
            <FormSectionTitle title="基本信息" />

            <div className="flex flex-col gap-4">
              <form.Field
                name="hardcap"
                validators={{
                  onChange: ({ value }) => {
                    const n = Number(value)
                    if (!value || Number.isNaN(n) || n <= 0) {
                      return '请输入大于 0 的硬顶金额'
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
                          硬顶 (Hard Cap)
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
                          title="设置募资硬顶 (BNB)"
                          description="募集达到硬顶后认购提前结束"
                          unit="BNB"
                          allowDecimal
                          maxDecimals={4}
                        />
                      </div>
                      {errorMsg && (
                        <p className="mt-1 text-xs text-red-500">{errorMsg}</p>
                      )}
                    </div>
                  )
                }}
              </form.Field>

              <form.Field
                name="softcap"
                validators={{
                  onChangeListenTo: ['hardcap'],
                  onChange: ({ value, fieldApi }) => {
                    const n = Number(value)
                    if (!value || Number.isNaN(n) || n <= 0) {
                      return '请输入大于 0 的软顶金额'
                    }
                    const hardcap = Number(
                      fieldApi.form.getFieldValue('hardcap'),
                    )
                    if (Number.isFinite(hardcap) && hardcap > 0) {
                      if (n !== hardcap / 2) {
                        return 'Soft Cap 必须是 Hard Cap 的一半'
                      }
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
                          软顶 (Soft Cap)
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
                          description="认购期结束时未达此金额则预售失败并全额退款"
                          unit="BNB"
                          allowDecimal
                          maxDecimals={4}
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
          </div>

          <div className="flex flex-col gap-6">
            <FormSectionTitle title="锁仓释放" />

            <div className="flex flex-col gap-4">
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
                          Vesting delay (7-90)
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
                          title="设置释放周期 (7-90 天)"
                          description="开盘后每过一个周期解锁一期代币份额"
                          unit="天"
                          min={7}
                          max={90}
                        />
                      </div>
                      {errorMsg && (
                        <p className="mt-1 text-xs text-red-500">{errorMsg}</p>
                      )}
                    </div>
                  )
                }}
              </form.Field>

              <form.Field
                name="vestingRate"
                validators={{
                  onChange: ({ value }) => {
                    if (value < 5 || value > 20) {
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
                      <TaxSlider
                        label="Vesting rate (5%-20%)"
                        required
                        min={5}
                        max={20}
                        step={1}
                        value={field.state.value}
                        onChange={field.handleChange}
                      />
                      {errorMsg && (
                        <p className="mt-1 text-xs text-red-500">{errorMsg}</p>
                      )}
                    </div>
                  )
                }}
              </form.Field>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-t-white/10 bg-[#131516] p-4">
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.isValid && !state.isSubmitting && Boolean(address),
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <>
              {!address && (
                <p className="mb-2 text-xs text-neutral-400">请先连接钱包</p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/60 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-base font-bold text-white shadow-[0_3px_0_0_#963000] transition-[transform,opacity] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFA546]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-5 animate-spin" />
                    <span>提交中…</span>
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
