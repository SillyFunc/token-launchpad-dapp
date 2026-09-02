import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useConfig } from 'wagmi'
import {
  signMessage,
  writeContract,
  waitForTransactionReceipt,
} from '@wagmi/core'
import { type Abi, parseEther } from 'viem'
import { Loader2, Info } from 'lucide-react'

import { FormSectionTitle } from '@/components/common/form-section-title'
import { TaxSlider } from '@/components/common/tax-slider'
import { NumericInput } from '@/components/ui/numeric-keypad'
import { toast } from '@/components/ui/toast'
import { savePresaleInfo } from '@/api/token'
import { getSignMessage } from '@/api/auth'
import { CONTRACT_ADDRESSES } from '@/contracts/addresses'
import CoordinatorFactoryAbiJson from '@/contracts/abi/CoordinatorFactory.json'

const CoordinatorFactoryAbi = CoordinatorFactoryAbiJson as unknown as Abi
const DAY = 86400n

/** docs §6.1 / §6.2 自定义错误名 → 友好文案 */
const KNOWN_ERRORS: Record<string, string> = {
  TokenNotRegistered: '代币不存在或非本平台创建',
  NotTokenCreator: '仅创建者可配置预售条款',
  AlreadyConfigured: '预售条款已配置，不可重复修改',
  InvalidPrice: '预售价必须大于 0',
  InvalidMaxBuyPerWallet: '单钱包上限必须大于 0',
  CreatorBuyTokensWithoutFunding: '设置了创建者购买目标但未附购买注资',
  InvalidVestingDelay: '释放周期须在 7 至 90 天之间',
  InvalidVestingRate: '释放比例须在 5% 至 20% 之间',
  SlippageTooHigh: '滑点不能超过 10%',
  SoftCapTooLow: '软顶须不小于加池下限',
}

function friendlyError(err: unknown): string {
  if (err instanceof Error || (err && typeof err === 'object')) {
    const msg = err instanceof Error
      ? err.message
      : String((err as { shortMessage?: string }).shortMessage ?? err)
    if (msg.includes('User rejected') || msg.includes('rejected the request'))
      return '用户已取消交易'
    if (msg.includes('insufficient funds') || msg.includes('exceeds balance'))
      return '钱包 BNB 余额不足'
    if (msg.includes('Ownable: caller is not the owner'))
      return '仅所有者可操作'
    for (const [name, text] of Object.entries(KNOWN_ERRORS)) {
      if (msg.includes(name)) return text
    }
    return msg
  }
  return '配置失败，请稍后重试'
}

interface PresaleFormProps {
  tokenAddress: `0x${string}`
  address: `0x${string}`
}

/**
 * 预售条款表单 — 拥有 useForm 实例（保证 TanStack Form 完整类型推断）。
 * 仅在父组件 gate 校验全部通过后渲染，故此处不再重复钱包/网络/已配置等前置判断。
 *
 * 字段对齐 docs §3.2 PresaleConfig（10 项）+ creatorBuyBnb（setupPresale 的 msg.value）。
 */
export function PresaleForm({ tokenAddress, address }: PresaleFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const config = useConfig()
  const coordinator = CONTRACT_ADDRESSES[97].coordinatorFactory

  const form = useForm({
    defaultValues: {
      presaleTokenPrice: '0.001',
      maxBuyPerWallet: '1000',
      hardcap: '',
      softcap: '',
      minLiquidityAmount: '',
      startTime: '0',
      vestingDelay: '7',
      vestingRate: 10,
      slippage: 5,
      creatorBuyTokens: '0',
      creatorBuyBnb: '',
    },
    onSubmit: async ({ value }) => {
      const hardcapWei = parseEther(value.hardcap || '0')
      const softcapWei = parseEther(value.softcap || '0')
      const minLiquidityWei = parseEther(value.minLiquidityAmount || '0')
      const priceWei = parseEther(value.presaleTokenPrice || '0')
      const maxBuyWei = parseEther(value.maxBuyPerWallet || '0')
      const vestingDelaySec = BigInt(Number(value.vestingDelay) || 0) * DAY
      const creatorBuyTokensWei = parseEther(value.creatorBuyTokens || '0')
      const creatorBuyBnbWei = parseEther(value.creatorBuyBnb || '0')
      const startTime = BigInt(Number(value.startTime) || 0)

      try {
        const message = await getSignMessage(address)
        const signature = await signMessage(config, { message })

        // ① 后端落档（savePresaleInfo 已含 10 字段 + creatorBuyBnb）
        await savePresaleInfo({
          token: tokenAddress,
          presaleConfig: {
            presaleTokenPrice: priceWei.toString(),
            maxBuyPerWallet: maxBuyWei.toString(),
            hardcap: hardcapWei.toString(),
            minLiquidityAmount: minLiquidityWei.toString(),
            softCap: softcapWei.toString(),
            startTime: Number(startTime),
            vestingDelay: Number(value.vestingDelay),
            vestingRate: Number(value.vestingRate),
            slippage: Math.round(value.slippage * 100), // % → bps
            creatorBuyTokens: creatorBuyTokensWei.toString(),
          },
          creatorBuyBnb: creatorBuyBnbWei.toString(),
          address,
          message,
          signature,
        })

        // ② 链上 setupPresale（一次性，msg.value = 创建者购买注资，可为 0）
        const hash = await writeContract(config, {
          address: coordinator,
          abi: CoordinatorFactoryAbi,
          functionName: 'setupPresale',
          chainId: 97,
          args: [
            tokenAddress,
            {
              presaleTokenPrice: priceWei,
              maxBuyPerWallet: maxBuyWei,
              hardcap: hardcapWei,
              minLiquidityAmount: minLiquidityWei,
              softCap: softcapWei,
              startTime,
              vestingDelay: vestingDelaySec,
              vestingRate: BigInt(value.vestingRate),
              slippage: BigInt(Math.round(value.slippage * 100)),
              creatorBuyTokens: creatorBuyTokensWei,
            },
          ],
          value: creatorBuyBnbWei > 0n ? creatorBuyBnbWei : undefined,
        })

        await waitForTransactionReceipt(config, { hash, chainId: 97 })

        toast.success('预售条款已配置，前往控制台开启认购')
        queryClient.invalidateQueries({ queryKey: ['creatorTokens', address] })
        navigate('/dashboard')
      } catch (err: unknown) {
        toast.error(friendlyError(err), '配置失败')
      }
    },
  })

  const expectedSoftcap = useMemo(
    () => {
      const h = Number(form.state.values.hardcap || 0)
      return h > 0 ? (h / 2).toString() : ''
    },
    [form.state.values.hardcap],
  )

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void form.handleSubmit()
      }}
    >
      {/* 认购参数 */}
      <div className="flex flex-col gap-4">
        <FormSectionTitle title="认购参数" required />

        <form.Field
          name="presaleTokenPrice"
          validators={{
            onChange: ({ value }) => {
              const n = Number(value)
              if (!value || Number.isNaN(n) || n <= 0)
                return '预售价必须大于 0'
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap
              label="预售价 (BNB / 枚)"
              required
              error={field.state.meta.errors[0]}
            >
              <NumericInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                title="设置预售价"
                description="每 1 枚代币的 BNB 价格，必须大于 0"
                unit="BNB"
                allowDecimal
                maxDecimals={8}
              />
            </FieldWrap>
          )}
        </form.Field>

        <form.Field
          name="maxBuyPerWallet"
          validators={{
            onChange: ({ value }) => {
              const n = Number(value)
              if (!value || Number.isNaN(n) || n <= 0)
                return '单钱包上限必须大于 0'
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap
              label="单钱包认购上限 (代币数)"
              required
              error={field.state.meta.errors[0]}
            >
              <NumericInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                title="设置单钱包上限"
                description="每个钱包最多可认购的代币数量（18 位精度）"
                unit="代币"
                allowDecimal
                maxDecimals={4}
              />
            </FieldWrap>
          )}
        </form.Field>
      </div>

      {/* 募资池 */}
      <div className="flex flex-col gap-4">
        <FormSectionTitle title="募资池" required />

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
            <FieldWrap
              label="硬顶 (Hard Cap)"
              required
              error={field.state.meta.errors[0]}
            >
              <NumericInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                title="设置募资硬顶 (BNB)"
                description="募集达到硬顶后认购提前结束；填 0 表示不限"
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
            onChangeListenTo: ['hardcap', 'minLiquidityAmount'],
            onChange: ({ value, fieldApi }) => {
              const n = Number(value)
              if (!value || Number.isNaN(n) || n <= 0)
                return '请输入大于 0 的软顶金额'
              const hardcap = Number(fieldApi.form.getFieldValue('hardcap'))
              if (Number.isFinite(hardcap) && hardcap > 0 && n !== hardcap / 2)
                return 'Soft Cap 必须是 Hard Cap 的一半'
              const minLiq = Number(
                fieldApi.form.getFieldValue('minLiquidityAmount'),
              )
              if (Number.isFinite(minLiq) && minLiq > 0 && n < minLiq)
                return '软顶必须不小于加池下限'
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap
              label="软顶 (Soft Cap)"
              required
              error={field.state.meta.errors[0]}
            >
              <NumericInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                title="设置预售成功软顶 (BNB)"
                description={`认购期结束时未达此金额则预售失败并全额退款（自动 = 硬顶/2 = ${expectedSoftcap || '--'} BNB）`}
                unit="BNB"
                allowDecimal
                maxDecimals={4}
              />
            </FieldWrap>
          )}
        </form.Field>

        <form.Field
          name="minLiquidityAmount"
          validators={{
            onChange: ({ value }) => {
              const n = Number(value)
              if (!value || Number.isNaN(n) || n <= 0)
                return '加池下限必须大于 0'
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap
              label="加池下限 (Min Liquidity)"
              required
              error={field.state.meta.errors[0]}
            >
              <NumericInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                title="设置加池最低 BNB"
                description="launch 时募资 BNB 不得低于此值，否则 revert InsufficientBNB"
                unit="BNB"
                allowDecimal
                maxDecimals={4}
              />
            </FieldWrap>
          )}
        </form.Field>

        <div className="flex items-start gap-2 rounded border border-[#2F3737] bg-[#181a1d] p-2.5 text-[11px] text-neutral-400">
          <Info className="mt-0.5 size-3.5 shrink-0 text-neutral-500" />
          <span>
            软顶须 ≥ 加池下限；硬顶为 0 时表示不限。请确保 hardcap ≥ 2 ×
            minLiquidity。
          </span>
        </div>
      </div>

      {/* 锁仓释放 */}
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
              label="释放周期 (Vesting Delay)"
              required
              error={field.state.meta.errors[0]}
            >
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
            </FieldWrap>
          )}
        </form.Field>

        <form.Field
          name="vestingRate"
          validators={{
            onChange: ({ value }) => {
              if (value < 5 || value > 20)
                return '释放比例须在 5% 至 20% 之间'
              return undefined
            },
          }}
        >
          {(field) => (
            <div className="flex flex-col">
              <TaxSlider
                label="释放比例 (Vesting Rate, 5%-20%)"
                required
                min={5}
                max={20}
                step={1}
                value={field.state.value}
                onChange={field.handleChange}
              />
              {field.state.meta.errors[0] && (
                <p className="mt-1 text-xs text-red-500">
                  {String(field.state.meta.errors[0])}
                </p>
              )}
            </div>
          )}
        </form.Field>
      </div>

      {/* 高级参数 */}
      <div className="flex flex-col gap-4">
        <FormSectionTitle title="高级参数" />

        <form.Field
          name="slippage"
          validators={{
            onChange: ({ value }) =>
              value < 0 || value > 10
                ? '滑点须在 0% 至 10% 之间（0 = 默认 5%）'
                : undefined,
          }}
        >
          {(field) => (
            <div className="flex flex-col">
              <TaxSlider
                label="加池滑点 (Slippage)"
                min={0}
                max={10}
                step={1}
                value={field.state.value}
                onChange={field.handleChange}
              />
              {field.state.meta.errors[0] && (
                <p className="mt-1 text-xs text-red-500">
                  {String(field.state.meta.errors[0])}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="startTime">
          {(field) => (
            <FieldWrap label="认购开始时间 (Unix 秒)">
              <NumericInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                title="认购起始时间"
                description="填 0 = 立即开放；其余填 Unix 秒级时间戳"
                unit="秒"
                min={0}
              />
            </FieldWrap>
          )}
        </form.Field>

        <div className="flex flex-col gap-4 rounded border border-[#2F3737] bg-[#181a1d] p-3">
          <div className="text-xs font-medium text-white">
            创建者购买注资（可选）
          </div>

          <form.Field
            name="creatorBuyBnb"
            validators={{
              onChange: ({ value }) => {
                const n = Number(value)
                if (value && (Number.isNaN(n) || n < 0))
                  return '注资金额必须 ≥ 0'
                return undefined
              },
            }}
          >
            {(field) => (
              <FieldWrap
                label="注资金额 (BNB)"
                labelClassName="text-xs text-neutral-400"
                error={field.state.meta.errors[0]}
              >
                <NumericInput
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  title="创建者购买注资 (BNB)"
                  description="launch 时花掉全部/按目标购买；填 0 = 不注资"
                  unit="BNB"
                  allowDecimal
                  maxDecimals={4}
                />
              </FieldWrap>
            )}
          </form.Field>

          <form.Field
            name="creatorBuyTokens"
            validators={{
              onChangeListenTo: ['creatorBuyBnb'],
              onChange: ({ value, fieldApi }) => {
                const n = Number(value)
                if (value && (Number.isNaN(n) || n < 0))
                  return '购买目标必须 ≥ 0'
                const bnb = Number(
                  fieldApi.form.getFieldValue('creatorBuyBnb'),
                )
                if (n > 0 && !(bnb > 0))
                  return '设置购买目标时必须附购买注资'
                return undefined
              },
            }}
          >
            {(field) => (
              <FieldWrap
                label="购买目标 (代币数, 0 = 随行就市)"
                labelClassName="text-xs text-neutral-400"
                error={field.state.meta.errors[0]}
              >
                <NumericInput
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  title="创建者购买目标"
                  description="0 = quote 模式花掉全部注资；>0 = 精确买入目标数量，超额退回"
                  unit="代币"
                  allowDecimal
                  maxDecimals={4}
                />
              </FieldWrap>
            )}
          </form.Field>
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
                <span>配置预售条款</span>
              )}
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* 表单字段外壳 — 纯展示，统一 label + 必填星号 + 错误文案                       */
/* -------------------------------------------------------------------------- */

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
