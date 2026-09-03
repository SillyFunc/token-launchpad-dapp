import { type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useConfig } from 'wagmi'
import {
  signMessage,
  writeContract,
  waitForTransactionReceipt,
} from '@wagmi/core'
import { parseEther } from 'viem'
import { Info } from 'lucide-react'
import { Web3ActionButton } from '@/components/common/web3-action-button'

import { FormSectionTitle } from '@/components/common/form-section-title'
import { NumericInput } from '@/components/common/numeric-keypad'
import { toast } from '@/components/ui/toast'
import { updateTokenInfo, type TokenDetail } from '@/api/token'
import { getSignMessage } from '@/api/auth'
import { CreatorBuySection } from '@/components/presale/creator-buy-section'
import {
  DEFAULT_CHAIN_ID,
  getContractAddresses,
} from '@/config/network'
import { CoordinatorFactoryAbi } from '@/contracts/abi'
import { parseContractError } from '@/lib/contract-error'
import { cn } from '@/lib/utils'

interface PresaleFormProps {
  token?: TokenDetail | null
  tokenAddress: string
  address: `0x${string}`
}

/**
 * 预售条款表单 — 提交时直接执行 setupPresale（链上配置+注资） + updateTokenInfo（后端存储）
 */
export function PresaleForm({
  token,
  tokenAddress,
  address,
}: PresaleFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const config = useConfig()

  const form = useForm({
    defaultValues: {
      presaleTokenPrice: token?.presaleTokenPrice
        ? String(token.presaleTokenPrice)
        : '',
      maxBuyPerWallet: token?.maxBuyPerWallet
        ? String(token.maxBuyPerWallet)
        : '',
      hardcap: token?.hardcap ? String(token.hardcap) : '',
      softcap:
        token?.softcap || token?.soft
          ? String(token.softcap || token.soft)
          : '',
      vestingDelay: token?.vestingDelay ? String(token.vestingDelay) : '7',
      vestingRate: token?.vestingRate ? Number(token.vestingRate) : 10,
      creatorBuyTokens: token?.creatorBuyTokens
        ? String(token.creatorBuyTokens)
        : '0',
      creatorBuyBnb: token?.creatorBuyBnb ? String(token.creatorBuyBnb) : '',
    },
    onSubmit: async ({ value }) => {
      const hardcapWei = parseEther(value.hardcap || '0')
      const softcapWei = parseEther(value.softcap || '0')
      const minLiquidityWei = softcapWei // 自动对齐软顶
      const priceWei = parseEther(value.presaleTokenPrice || '0.001')
      const maxBuyWei = parseEther(value.maxBuyPerWallet || '1000')

      const rawDelay = Number(value.vestingDelay) || 7
      const vestingDelaySec =
        rawDelay > 90 ? BigInt(rawDelay) : BigInt(rawDelay) * 86400n

      const creatorBuyTokensWei = parseEther(value.creatorBuyTokens || '0')
      let creatorBuyBnbWei = parseEther(value.creatorBuyBnb || '0')

      // 代币模式自动补齐注资
      if (creatorBuyTokensWei > 0n && creatorBuyBnbWei <= 0n) {
        creatorBuyBnbWei =
          (creatorBuyTokensWei * priceWei) / 1000000000000000000n
      }

      try {
        const coordinator =
          getContractAddresses(DEFAULT_CHAIN_ID).coordinatorFactory

        // ① 链上调用 coordinator.setupPresale（一次性配置 + 购买注资）
        const setupHash = await writeContract(config, {
          address: coordinator,
          abi: CoordinatorFactoryAbi,
          functionName: 'setupPresale',
          chainId: DEFAULT_CHAIN_ID,
          args: [
            tokenAddress as `0x${string}`,
            {
              presaleTokenPrice: priceWei,
              maxBuyPerWallet: maxBuyWei,
              hardcap: hardcapWei,
              minLiquidityAmount: minLiquidityWei,
              softCap: softcapWei,
              startTime: 0n,
              vestingDelay: vestingDelaySec,
              vestingRate: BigInt(Number(value.vestingRate || 10)),
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

        // ② 签名并保存预售信息到后端数据库
        const message = await getSignMessage(address)
        const signature = await signMessage(config, { message })

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
          presaleTokenPrice: value.presaleTokenPrice,
          maxBuyPerWallet: value.maxBuyPerWallet,
          hardcap: value.hardcap,
          softcap: value.softcap,
          minLiquidityAmount: value.softcap,
          startTime: 0,
          endTime: 0,
          vestingDelay: Number(value.vestingDelay) || 7,
          vestingRate: Number(value.vestingRate) || 10,
          slippage: 0,
          creatorBuyTokens: value.creatorBuyTokens || '0',
          creatorBuyBnb: value.creatorBuyBnb || '0',
          address,
          message,
          signature,
        })

        toast.success('预售条款已成功配置上链！前往控制台开启认购')
        queryClient.invalidateQueries({ queryKey: ['creatorTokens', address] })
        navigate('/dashboard')
      } catch (err: unknown) {
        toast.error(parseContractError(err), '配置失败')
      }
    },
  })

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
                placeholder=""
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
                placeholder=""
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
                placeholder=""
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
            onChangeListenTo: ['hardcap'],
            onChange: ({ value, fieldApi }) => {
              const n = Number(value)
              if (!value || Number.isNaN(n) || n <= 0)
                return '请输入大于 0 的软顶金额'
              const hardcap = Number(fieldApi.form.getFieldValue('hardcap'))
              if (Number.isFinite(hardcap) && hardcap > 0 && n > hardcap)
                return '软顶金额不能超过硬顶'
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
                placeholder=""
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                title="设置预售成功软顶 (BNB)"
                description="认购期结束时若募集金额达到软顶，将自动开启加池开盘；未达到则发行失败并全额退款"
                unit="BNB"
                allowDecimal
                maxDecimals={4}
              />
            </FieldWrap>
          )}
        </form.Field>

        <div className="flex items-start gap-2 border border-[#2F3737] bg-[#181a1d] p-2.5 text-[11px] text-neutral-400">
          <Info className="mt-0.5 size-3.5 shrink-0 text-neutral-500" />
          <span>
            认购结束时若募集金额达到软顶，即可一键加池开盘；若未达软顶则预售失败，认购者全额原路退款。
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
            const currentVal = Number(field.state.value) || 10
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

        {/* 锁仓释放明细（动态展示分轮与每轮比例） */}
        <form.Subscribe
          selector={(state) => ({
            rate: Number(state.values.vestingRate) || 10,
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

      {/* 创建者代币购买（独立 Section） */}
      <div className="flex flex-col gap-4">
        <form.Subscribe
          selector={(state) => ({
            creatorBuyBnb: state.values.creatorBuyBnb,
            creatorBuyTokens: state.values.creatorBuyTokens,
            presaleTokenPrice: state.values.presaleTokenPrice,
          })}
        >
          {({ creatorBuyBnb, creatorBuyTokens, presaleTokenPrice }) => (
            <CreatorBuySection
              address={address}
              presaleTokenPrice={presaleTokenPrice}
              creatorBuyBnb={creatorBuyBnb}
              creatorBuyTokens={creatorBuyTokens}
              onChangeBnb={(val) => form.setFieldValue('creatorBuyBnb', val)}
              onChangeTokens={(val) =>
                form.setFieldValue('creatorBuyTokens', val)
              }
            />
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
              disabled={!canSubmit}
              loading={isSubmitting}
              loadingText="配置并上链中…"
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 border border-white/60 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-base font-bold text-white shadow-[0_3px_0_0_#963000] transition-[transform,opacity] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFA546]"
            >
              <span>保存并配置预售</span>
            </Web3ActionButton>
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
