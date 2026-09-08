import { useState, useEffect, useRef } from 'react'
import { useBalance } from 'wagmi'
import { formatUnits, parseEther } from 'viem'
import { ArrowLeftRight, Coins } from 'lucide-react'

import bnbIcon from '@/assets/bnb-icon.svg'
import { DEFAULT_CHAIN_ID } from '@/config/network'
import { cn } from '@/lib/utils'
import { FormSectionTitle } from '@/components/common/form-section-title'

export interface CreatorBuySectionProps {
  address: `0x${string}`
  /** 开盘池价（BNB/枚 = 硬顶 / 池份额），仅用于换算预估；未填硬顶时为 0，输入不受限 */
  poolTokenPriceBnb?: number
  creatorBuyBnb: string
  creatorBuyTokens: string
  onChangeBnb: (val: string) => void
  onChangeTokens: (val: string) => void
  /** BNB 注资口径上限 = 开盘池 BNB（≈硬顶）的 1/3 */
  maxCreatorBuyBnb?: number
  /** 代币口径上限 = 开盘池代币份额的 25%（合约常量 MAX_CREATOR_BUY_POOL_BPS = 2500） */
  maxCreatorBuyTokens?: number
  /** 预售价格（BNB/枚）；未设置时禁用创建者购买输入 */
  presaleTokenPrice?: string
}

function formatCleanNumber(num: number, maxDecimals = 8): string {
  if (!Number.isFinite(num) || num <= 0) return '0'
  return String(parseFloat(num.toFixed(maxDecimals)))
}

export function CreatorBuySection({
  address,
  poolTokenPriceBnb,
  creatorBuyBnb,
  creatorBuyTokens,
  onChangeBnb,
  onChangeTokens,
  maxCreatorBuyBnb,
  maxCreatorBuyTokens,
  presaleTokenPrice,
}: CreatorBuySectionProps) {
  const hasTokens = Number(creatorBuyTokens) > 0
  const hasBnb = Number(creatorBuyBnb) > 0
  const initialMode = hasTokens ? 'TOKEN' : 'BNB'

  // 模式：'BNB' = 按注资 BNB 买入 (quote 模式)；'TOKEN' = 按目标代币数买入
  const [mode, setMode] = useState<'BNB' | 'TOKEN'>(initialMode)

  // 本地输入框文本
  const [inputValue, setInputValue] = useState<string>(() => {
    if (hasTokens) {
      return String(creatorBuyTokens)
    }
    if (hasBnb) {
      return String(creatorBuyBnb)
    }
    return ''
  })

  // 标记是否已完成来自服务端的异步初值回填（避免用户输入过程中被重复重置）
  const hasSyncedInitialRef = useRef(hasTokens || hasBnb)

  // 钱包余额
  const { data: balanceData } = useBalance({
    address,
    chainId: DEFAULT_CHAIN_ID,
    query: {
      enabled: Boolean(address),
      staleTime: 10_000,
    },
  })

  const rawBalanceNum = balanceData
    ? Number(formatUnits(balanceData.value, balanceData.decimals))
    : 0

  // 格式化展示余额 (保留4位小数)
  const formattedBalance = rawBalanceNum.toFixed(4)

  const poolPriceNum = poolTokenPriceBnb ?? 0
  const hasPresalePrice = Number(presaleTokenPrice || 0) > 0
  const purchaseDisabled = !hasPresalePrice

  // 同步外部表单初值（仅在首次从异步接口拉到数据时做一次性回填）
  useEffect(() => {
    if (hasSyncedInitialRef.current) return

    const numTokens = Number(creatorBuyTokens) || 0
    const numBnb = Number(creatorBuyBnb) || 0

    if (numTokens > 0) {
      setMode('TOKEN')
      setInputValue(String(creatorBuyTokens))
      hasSyncedInitialRef.current = true
    } else if (numBnb > 0) {
      setMode('BNB')
      setInputValue(String(creatorBuyBnb))
      hasSyncedInitialRef.current = true
    }
  }, [creatorBuyBnb, creatorBuyTokens])

  // 切换模式时的同步
  const handleToggleMode = () => {
    if (purchaseDisabled) return
    hasSyncedInitialRef.current = true

    if (mode === 'BNB') {
      // 切换到代币模式：有池价时按池价换算预估代币数，无池价则清空待填
      const bnbNum = Number(inputValue) || 0
      if (bnbNum > 0 && poolPriceNum > 0) {
        const tokens = formatCleanNumber(bnbNum / poolPriceNum, 4)
        setInputValue(tokens)
        onChangeTokens(tokens)
        onChangeBnb(formatCleanNumber(bnbNum, 6))
      } else {
        setInputValue('')
        onChangeTokens('0')
        onChangeBnb('0')
      }
      setMode('TOKEN')
    } else {
      // 切换到 BNB 模式：有池价时换算预估所需 BNB，无池价则清空待填
      const tokenNum = Number(inputValue) || 0
      if (tokenNum > 0 && poolPriceNum > 0) {
        const bnb = formatCleanNumber(tokenNum * poolPriceNum, 6)
        setInputValue(bnb)
        onChangeBnb(bnb)
        onChangeTokens('0')
      } else {
        setInputValue('')
        onChangeBnb('0')
        onChangeTokens('0')
      }
      setMode('BNB')
    }
  }

  // 输入框变化处理
  const handleInputChange = (val: string) => {
    if (purchaseDisabled) return
    hasSyncedInitialRef.current = true
    // 仅允许合法正浮点数
    if (val !== '' && !/^\d*\.?\d*$/.test(val)) return
    setInputValue(val)

    const num = Number(val) || 0
    if (num <= 0) {
      onChangeBnb('0')
      onChangeTokens('0')
      return
    }

    if (mode === 'BNB') {
      const clamped =
        maxCreatorBuyBnb && maxCreatorBuyBnb > 0
          ? Math.min(num, maxCreatorBuyBnb)
          : num
      onChangeBnb(String(clamped))
      onChangeTokens('0') // quote 模式
    } else {
      const clamped =
        maxCreatorBuyTokens && maxCreatorBuyTokens > 0
          ? Math.min(num, maxCreatorBuyTokens)
          : num
      onChangeTokens(String(clamped))
      // token 模式附带预估注资（按开盘池价）；无池价时留 0，提交前按池份额精确计算
      onChangeBnb(
        poolPriceNum > 0 ? formatCleanNumber(clamped * poolPriceNum, 6) : '0',
      )
    }
  }

  // 快捷百分比：两种模式都先按钱包 BNB 余额的 n% 计算投入金额。
  // BNB 模式回填 BNB；代币模式再按池价换算代币，并限制在最大购买量以内。
  const handlePercentClick = (percent: number) => {
    if (purchaseDisabled || !balanceData) return
    hasSyncedInitialRef.current = true

    if (mode === 'BNB') {
      const balanceWei = balanceData.value
      const maxBuyWei =
        maxCreatorBuyBnb && maxCreatorBuyBnb > 0
          ? parseEther(String(maxCreatorBuyBnb))
          : balanceWei
      const baseWei = balanceWei < maxBuyWei ? balanceWei : maxBuyWei
      const targetWei = (baseWei * BigInt(percent)) / 100n
      const bnbStr = targetWei > 0n ? formatUnits(targetWei, balanceData.decimals) : '0'
      setInputValue(bnbStr)
      onChangeBnb(bnbStr)
      onChangeTokens('0')
      return
    }

    if (!poolPriceNum || poolPriceNum <= 0 || !maxCreatorBuyTokens || maxCreatorBuyTokens <= 0) return

    const walletBnb = Number(formatUnits(balanceData.value, balanceData.decimals))
    const targetBnb = (walletBnb * percent) / 100
    const targetTokens = targetBnb / poolPriceNum
    const tokens = formatCleanNumber(
      Math.min(targetTokens, maxCreatorBuyTokens),
      8,
    )
    const actualBnb = formatCleanNumber(Number(tokens) * poolPriceNum, 8)

    setInputValue(tokens)
    onChangeTokens(tokens)
    onChangeBnb(actualBnb)
  }

  // 估算优先取非零外部值；外部初始值为字符串 "0" 时回退到当前输入框。
  const externalInputValue =
    mode === 'BNB'
      ? Number(creatorBuyBnb) > 0
        ? creatorBuyBnb
        : inputValue
      : Number(creatorBuyTokens) > 0
        ? creatorBuyTokens
        : inputValue
  const inputNum = Number(externalInputValue) || 0

  const handleInputBlur = () => {
    if (purchaseDisabled) return
    const num = Number(inputValue)
    if (!Number.isFinite(num) || num <= 0) return

    if (mode === 'BNB' && maxCreatorBuyBnb && maxCreatorBuyBnb > 0) {
      const clamped = Math.min(num, maxCreatorBuyBnb)
      setInputValue(formatCleanNumber(clamped, 6))
      onChangeBnb(formatCleanNumber(clamped, 6))
      onChangeTokens('0')
    } else if (
      mode === 'TOKEN' &&
      maxCreatorBuyTokens &&
      maxCreatorBuyTokens > 0
    ) {
      const clamped = Math.min(num, maxCreatorBuyTokens)
      setInputValue(formatCleanNumber(clamped, 4))
      onChangeTokens(formatCleanNumber(clamped, 4))
      onChangeBnb(
        poolPriceNum > 0 ? formatCleanNumber(clamped * poolPriceNum, 6) : '0',
      )
    }
  }

  return (
    <div className="flex flex-col gap-3 text-white">
      {/* 模块标题与说明 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <FormSectionTitle title="创建者代币购买" />
          <span className="bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-400">
            可选
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-neutral-400">
          创建者少量买入有助于减少抢跑，提高代币发行安全性。超额支付将在开盘时同交易自动退回。
        </p>
      </div>

      {/* 余额与限额信息 */}
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">钱包余额：</span>
          <span className="font-mono font-medium text-white">
            {formattedBalance} BNB
          </span>
        </div>
      </div>

      {/* 主输入框与右侧切换按钮 */}
      <div className="flex flex-col gap-1">
        <div
          className={cn(
            'flex h-11 items-center justify-between border border-[#484b51] bg-[#141517] px-3 transition-colors focus-within:border-[#FE810B]',
          )}
        >
          {/* 左侧数值输入 */}
          <input
            type="text"
            inputMode="decimal"
            placeholder=""
            value={purchaseDisabled ? '' : inputValue}
            disabled={purchaseDisabled}
            onChange={(e) => handleInputChange(e.target.value)}
            onBlur={handleInputBlur}
            className="w-full bg-transparent font-mono text-sm font-medium text-white placeholder:text-neutral-500 focus:outline-none"
          />

          {/* 中间细分割线 */}
          <div className="mx-3 h-5 w-px shrink-0 bg-white/15" />

          {/* 右侧模式切换按钮 */}
          <button
            type="button"
            onClick={handleToggleMode}
            disabled={purchaseDisabled}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white transition-all hover:bg-white/10 hover:text-[#FFA546] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            title="点击切换输入币种 (BNB / 代币)"
          >
            {mode === 'BNB' ? (
              <>
                <img src={bnbIcon} alt="BNB" className="size-4 shrink-0" />
                <span>BNB</span>
              </>
            ) : (
              <>
                <Coins className="size-4 shrink-0 text-[#FFA546]" />
                <span>代币</span>
              </>
            )}
            <ArrowLeftRight className="ml-0.5 size-3 text-[#FFA546]" />
          </button>
        </div>
      </div>

      {/* 快捷百分比按钮组 (25% / 50% / 75% / 100%) */}
      <div className="grid grid-cols-4 gap-2">
        {[25, 50, 75, 100].map((percent) => (
          <button
            key={percent}
            type="button"
            onClick={() => handlePercentClick(percent)}
            disabled={
              purchaseDisabled ||
              !balanceData ||
              (mode === 'TOKEN' &&
                (!poolPriceNum || poolPriceNum <= 0 || !maxCreatorBuyTokens))
            }
            className="flex h-8 cursor-pointer items-center justify-center border border-[#2F3737] bg-[#1a1c1e] text-xs font-semibold text-neutral-300 transition-all select-none hover:border-[#FE810B] hover:text-[#FFA546] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {percent}%
          </button>
        ))}
      </div>

      {/* 底部换算 */}
      <div className="border-t border-white/5 pt-2 text-[11px] text-neutral-400">
        {mode === 'BNB' ? (
          <span>
            预计获得：
            <strong className="font-mono text-white">
              {poolPriceNum > 0 && inputNum > 0
                ? (inputNum / poolPriceNum).toLocaleString(undefined, {
                    maximumFractionDigits: 8,
                  })
                : '--'}
            </strong>{' '}
            代币
          </span>
        ) : (
          <span>
            预计需支付：
            <strong className="font-mono text-white">
              {poolPriceNum > 0 && inputNum > 0
                ? formatCleanNumber(inputNum * poolPriceNum, 8)
                : '--'}
            </strong>{' '}
            BNB
          </span>
        )}
      </div>
    </div>
  )
}
