import { type InputHTMLAttributes, type ReactNode } from 'react'
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
import { FieldInfo } from '@/components/common/field-info'
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
import { calculatePresaleTokenPrice } from '@/lib/presale-price'
import { cn } from '@/lib/utils'

/** 认购时长约束（主网文档 §2）：1 ~ 90 小时，边界允许，违规 revert InvalidDuration */
const DURATION_MIN_SEC = hoursToSeconds(1)
const DURATION_MAX_SEC = hoursToSeconds(90)

/** 释放周期约束（主网文档 §2）：5 ~ 30 分钟，边界允许，违规 revert InvalidVestingDelay */
const VESTING_DELAY_MIN_SEC = minutesToSeconds(5)
const VESTING_DELAY_MAX_SEC = minutesToSeconds(30)

/** 整数输入清洗：仅保留数字、去前导零（范围回填在 blur 时进行，避免打断输入） */
const sanitizeIntInput = (raw: string) =>
  raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')

/** 小数输入清洗：仅保留数字与第一个小数点，最多 4 位小数 */
const sanitizeDecimalInput = (raw: string, maxDecimals = 18) => {
  let next = raw.replace(/[^\d.]/g, '')
  const firstDot = next.indexOf('.')
  if (firstDot !== -1) {
    next =
      next.slice(0, firstDot + 1) +
      next
        .slice(firstDot + 1)
        .replace(/\./g, '')
        .slice(0, maxDecimals)
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

  // 开盘池代币份额 = 发行总量 × poolBps；创建者购买上限 = 份额的 5%
  // （合约常量 MAX_CREATOR_BUY_POOL_BPS = 500；quote 模式花费上限 = 池 BNB × 500/9500 ≈ 1/19，
  // 恒定乘积下与 token 模式 5% 共用同一物理上界）
  const poolShare = (totalSupply * BigInt(poolBps)) / 10000n
  const poolShareNum = Number(formatEther(poolShare))
  const maxCreatorBuyTokensNum =
    poolShare > 0n ? Number(formatEther(poolShare / 20n)) : 0

  const initialHardcap = token?.hardcap ? String(token.hardcap) : ''
  const initialSoftcap =
    token?.softcap || token?.soft ? String(token.softcap || token.soft) : ''

  const initialMaxBuyBnb = (() => {
    if (token?.maxBuyPerWallet && token?.presaleTokenPrice) {
      try {
        const maxBuyTokensWei = parseEther(String(token.maxBuyPerWallet))
        const priceWei = parseEther(String(token.presaleTokenPrice))
        if (maxBuyTokensWei > 0n && priceWei > 0n) {
          return formatEther((maxBuyTokensWei * priceWei) / 10n ** 18n)
        }
      } catch {
        // Ignore malformed persisted values and leave the field empty.
      }
    }
    return ''
  })()

  // 后端 vestingDelay 以秒存储，表单展示口径为分钟；历史脏值夹紧到主网合法区间
  const initialVestingDelayMinutes = (() => {
    const sec = Number(token?.vestingDelay) || 0
    if (sec <= 0) return '5'
    const minutes = Math.round(sec / 60)
    return String(Math.min(30, Math.max(5, minutes)))
  })()

  const form = useForm({
    defaultValues: {
      maxBuyBnb: initialMaxBuyBnb,
      hardcap: initialHardcap,
      softcap: initialSoftcap,
      vestingDelayMinutes: initialVestingDelayMinutes,
      vestingRate: token?.vestingRate ? Number(token.vestingRate) : 5,
      creatorBuyTokens: token?.creatorBuyTokens
        ? String(token.creatorBuyTokens)
        : '0',
      creatorBuyBnb: token?.creatorBuyBnb ? String(token.creatorBuyBnb) : '',
      startTime: '',
      durationHours: '1',
    },
    onSubmit: async ({ value }) => {
      const hardcapNum = Number(value.hardcap || '0')
      const hardcapWei = parseEther(value.hardcap || '0')
      // 软顶取表单实际填写值（校验器已约束在硬顶的 50% ~ 100%）
      const softcapStr = value.softcap || '0'
      const softcapWei = parseEther(softcapStr)
      const minLiquidityWei = softcapWei // 自动对齐软顶

      const priceWei = calculatePresaleTokenPrice(hardcapWei, presaleShare)
      if (!priceWei) {
        toast.error('请输入有效的硬顶，并等待预售份额读取完成')
        return
      }
      const priceBNB = formatEther(priceWei)

      const maxBuyBnbWei = parseEther(value.maxBuyBnb || '0')
      const maxRaiseWei = (priceWei * presaleShare) / 10n ** 18n
      if (
        maxBuyBnbWei <= 0n ||
        maxBuyBnbWei > hardcapWei ||
        maxBuyBnbWei > maxRaiseWei
      ) {
        toast.error('单钱包认购上限须大于 0 且不超过硬顶')
        return
      }
      if (maxRaiseWei < softcapWei) {
        toast.error('当前预售价下即使售罄也达不到软顶，请提高预售价')
        return
      }
      // 合约字段 maxBuyPerWallet 的单位是代币 wei，按自动计算的预售价换算。
      const maxBuyWei = (maxBuyBnbWei * 10n ** 18n) / priceWei
      if (maxBuyWei <= 0n) {
        toast.error('单钱包认购上限过小，换算后不足 1 个最小代币单位')
        return
      }
      const maxBuyTokensStr = formatEther(maxBuyWei)

      // 释放周期（秒）：5 ~ 30 分钟
      const vestingDelaySec = BigInt(
        Math.round(minutesToSeconds(Number(value.vestingDelayMinutes || 0))),
      )
      if (
        vestingDelaySec < VESTING_DELAY_MIN_SEC ||
        vestingDelaySec > VESTING_DELAY_MAX_SEC
      ) {
        toast.error('释放周期须在 5 至 30 分钟之间')
        return
      }

      // 认购时长（秒）：1 ~ 90 小时
      const durationSec = Math.round(
        hoursToSeconds(Number(value.durationHours || '0')),
      )
      if (durationSec < DURATION_MIN_SEC || durationSec > DURATION_MAX_SEC) {
        toast.error('认购时长须在 1 至 90 小时之间')
        return
      }

      // 开始时间：0 = 立即（链上语义）；后端与链上保持同口径传 0，
      // 真实结束时间由后端解析 openPresale 交易后按链上 endTime 为准
      const pickedStartSec = Number(value.startTime) || 0

      const creatorBuyTokensWei = parseEther(value.creatorBuyTokens || '0')
      let creatorBuyBnbWei = parseEther(value.creatorBuyBnb || '0')

      // 代币模式注资：按恒定乘积精确覆盖价格影响 B·t/(T−t)（t = T/20 时恰为池 BNB 的 1/19，
      // 与合约 quote 模式花费上限同口径）；合约对超额部分同交易自动退回
      if (creatorBuyTokensWei > 0n) {
        if (poolShare <= creatorBuyTokensWei) {
          toast.error('发行总量未就绪，无法计算创建者购买注资')
          return
        }
        creatorBuyBnbWei =
          (hardcapWei * creatorBuyTokensWei) / (poolShare - creatorBuyTokensWei)
      }

      // 校验创建者购买上限：开盘池代币份额的 5%（quote 模式 BNB 花费口径 ≈ 池 BNB 的 1/19）
      const creatorBuyBnbNum = Number(formatEther(creatorBuyBnbWei))
      const maxCreatorBuyBnbAllowed = hardcapNum / 19
      if (
        maxCreatorBuyBnbAllowed > 0 &&
        creatorBuyBnbNum > maxCreatorBuyBnbAllowed + 0.0001
      ) {
        toast.error(
          `创建者注资不能超过购买上限（开盘池份额 5% ≈ ${maxCreatorBuyBnbAllowed.toFixed(4)} BNB）`,
        )
        return
      }
      if (poolShare > 0n && creatorBuyTokensWei > poolShare / 20n) {
        toast.error(
          `创建者购买数量不能超过开盘池份额的 5%（${formatTokenSupply(poolShare / 20n, locale)} 枚）`,
        )
        return
      }
      if (!resolvedTokenAddress || !isAddress(resolvedTokenAddress)) {
        toast.error('未找到有效的代币合约地址，请先在控制台完成代币发行')
        return
      }

      try {
        const coordinator =
          getContractAddresses(DEFAULT_CHAIN_ID).coordinatorFactory

        const auth = await requestAuthSignature(config, address)

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
          vestingDelay: Number(vestingDelaySec),
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
              <FieldWrap label="硬顶" required>

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
              <FieldWrap label="软顶" required>

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
              <FieldInfo field={field} />
            </FieldWrap>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.hardcap}>
          {(hardcap) => {
            let priceText = ''
            try {
              const priceWei = calculatePresaleTokenPrice(
                parseEther(hardcap || '0'),
                presaleShare,
              )
              priceText = priceWei ? formatEther(priceWei) : ''
            } catch {
              priceText = ''
            }

            return (
              <FieldWrap label="预售价格（自动计算）" required>
                <UnitInput
                  readOnly
                  value={priceText}
                  placeholder="填写硬顶后自动计算"
                  unit="BNB/枚"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  单价 = 向上取整（硬顶 ÷ 预售总量），售罄募集金额不低于硬顶
                </p>
              </FieldWrap>
            )
          }}
        </form.Subscribe>

        <form.Field
          name="maxBuyBnb"
          validators={{
            onChangeListenTo: [
              'hardcap',
              'softcap',
            ],
            onChange: ({ value, fieldApi }) => {
              if (!value) return '请输入单钱包认购上限'
              let maxBuyBnbWei: bigint
              try {
                maxBuyBnbWei = parseEther(value)
              } catch {
                return '请输入有效的 BNB 金额'
              }
              if (maxBuyBnbWei <= 0n) return '单钱包认购上限必须大于 0'

              const hardcap = fieldApi.form.getFieldValue('hardcap')
              const softcap = fieldApi.form.getFieldValue('softcap')
              let hardcapWei: bigint
              let softcapWei: bigint
              try {
                hardcapWei = parseEther(hardcap || '0')
                softcapWei = parseEther(softcap || '0')
              } catch {
                return '请先输入有效的硬顶和软顶'
              }
              if (hardcapWei <= 0n) return '请先输入有效的硬顶金额'
              const priceWei = calculatePresaleTokenPrice(
                hardcapWei,
                presaleShare,
              )
              if (!priceWei) return '预售总量读取中，请稍后重试'
              if (maxBuyBnbWei > hardcapWei)
                return '单钱包认购上限不能超过硬顶'

              const maxRaiseWei = (priceWei * presaleShare) / 10n ** 18n
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
              <FieldInfo field={field} />
            </FieldWrap>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.hardcap}>
          {(hardcap) => {
            let presaleTokenPrice = ''
            try {
              const priceWei = calculatePresaleTokenPrice(
                parseEther(hardcap || '0'),
                presaleShare,
              )
              presaleTokenPrice = priceWei ? formatEther(priceWei) : ''
            } catch {
              presaleTokenPrice = ''
            }

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
                      {presaleTokenPrice || '--'}
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

        <form.Field
          name="startTime"
          validators={{
            onChange: ({ value }) =>
              value && Number(value) > 0 ? undefined : '请选择开始时间',
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
          name="durationHours"
          validators={{
            onChange: ({ value }) => {
              const n = Number(value)
              if (!value || Number.isNaN(n) || n <= 0) return '请输入认购时长'
              const sec = hoursToSeconds(n)
              if (sec < DURATION_MIN_SEC || sec > DURATION_MAX_SEC)
                return '认购时长须在 1 至 90 小时之间'
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap
              label="认购时长"
              required
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
                onBlur={field.handleBlur}
                unit="小时"
              />
              <FieldInfo field={field} />
              <p className="mt-1 text-xs text-neutral-500">
                认购时长须在 1 至 90 小时之间
              </p>
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
              if (!value || !Number.isInteger(n) || n < 5 || n > 30)
                return '释放周期须在 5 至 30 分钟之间'
              return undefined
            },
          }}
        >
          {(field) => (
            <FieldWrap
              label="释放周期"
              required
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
                onBlur={field.handleBlur}
                unit="分钟"
              />
              <FieldInfo field={field} />
              <p className="mt-1 text-xs text-neutral-500">
                释放周期须在 5 至 30 分钟之间
              </p>
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
                <FieldInfo field={field} />
              </FieldWrap>
            )
          }}
        </form.Field>

        <form.Subscribe
          selector={(state) => ({
            rate: Number(state.values.vestingRate) || 5,
            delay: Number(state.values.vestingDelayMinutes) || 5,
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
                    每 {delay} 分钟释放 {rate}%
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
            let presaleTokenPrice = ''
            try {
              const priceWei = calculatePresaleTokenPrice(
                parseEther(hardcap || '0'),
                presaleShare,
              )
              presaleTokenPrice = priceWei ? formatEther(priceWei) : ''
            } catch {
              presaleTokenPrice = ''
            }
            // BNB 注资口径上限 = 开盘池 BNB（≈硬顶）× 500/9500 ≈ 1/19，
            // 恒定乘积下恰为买走 5% 池代币的花费（合约 MAX_CREATOR_BUY_POOL_BPS = 500）
            const maxCreatorBuyBnb =
              hardcapNum > 0 ? Number((hardcapNum / 19).toFixed(4)) : 0
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
                presaleTokenPrice={presaleTokenPrice}
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
            canSubmit:
              state.canSubmit &&
              Boolean(
                state.values.hardcap &&
                  state.values.softcap &&
                  state.values.maxBuyBnb &&
                  state.values.startTime,
              ),
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Web3ActionButton
              type="submit"
              disabled={!canSubmit || presaleShare <= 0n}
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
  labelClassName?: string
  children: ReactNode
}

function FieldWrap({
  label,
  required = false,
  labelClassName = 'text-sm text-white',
  children,
}: FieldWrapProps) {
  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-center gap-0.5">
        <label className={labelClassName}>{label}</label>
        {required && <span className="text-xs text-[#f7594b]">*</span>}
      </div>
      {children}
    </div>
  )
}
