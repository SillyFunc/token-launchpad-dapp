import { useState, useEffect, useRef } from 'react'
import { useBalance } from 'wagmi'
import { formatUnits } from 'viem'
import { ArrowLeftRight, Coins, Info, Lock } from 'lucide-react'

import bnbIcon from '@/assets/bnb-icon.svg'
import { DEFAULT_CHAIN_ID } from '@/config/network'
import { cn } from '@/lib/utils'
import { FormSectionTitle } from '@/components/common/form-section-title'

export interface CreatorBuySectionProps {
  address: `0x${string}`
  presaleTokenPrice: string // 每 1 枚代币的 BNB 价格 (如 0.001)
  creatorBuyBnb: string
  creatorBuyTokens: string
  onChangeBnb: (val: string) => void
  onChangeTokens: (val: string) => void
  error?: string
}

function formatCleanNumber(num: number, maxDecimals = 6): string {
  if (!Number.isFinite(num) || num <= 0) return '0'
  return String(parseFloat(num.toFixed(maxDecimals)))
}

export function CreatorBuySection({
  address,
  presaleTokenPrice,
  creatorBuyBnb,
  creatorBuyTokens,
  onChangeBnb,
  onChangeTokens,
  error,
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

  const priceNum = Number(presaleTokenPrice) || 0
  const isPriceValid = priceNum > 0

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
    if (!isPriceValid) return
    hasSyncedInitialRef.current = true

    if (mode === 'BNB') {
      // 切换到代币模式：根据当前输入的 BNB 换算预估代币数
      const bnbNum = Number(inputValue) || 0
      if (bnbNum > 0 && priceNum > 0) {
        const tokens = formatCleanNumber(bnbNum / priceNum, 4)
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
      // 切换到 BNB 模式：根据当前输入的代币数换算所需 BNB
      const tokenNum = Number(inputValue) || 0
      if (tokenNum > 0 && priceNum > 0) {
        const bnb = formatCleanNumber(tokenNum * priceNum, 6)
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
    if (!isPriceValid) return
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
      onChangeBnb(val)
      onChangeTokens('0') // quote 模式
    } else {
      onChangeTokens(val)
      // 在 token 模式下，同时计算并附带所需的注资 BNB
      if (priceNum > 0) {
        const neededBnb = formatCleanNumber(num * priceNum, 6)
        onChangeBnb(neededBnb)
      }
    }
  }

  // 快捷百分比（基于钱包 BNB 余额，扣除 0.005 BNB gas 预留）
  const handlePercentClick = (percent: number) => {
    if (!isPriceValid) return
    const usableBnb = Math.max(0, rawBalanceNum - 0.005)
    const targetBnb = (usableBnb * percent) / 100

    if (mode === 'BNB') {
      const bnbStr = targetBnb > 0 ? formatCleanNumber(targetBnb, 4) : '0'
      setInputValue(bnbStr)
      onChangeBnb(bnbStr)
      onChangeTokens('0')
    } else {
      if (priceNum > 0) {
        const tokens = formatCleanNumber(targetBnb / priceNum, 2)
        setInputValue(tokens)
        onChangeTokens(tokens)
        onChangeBnb(formatCleanNumber(targetBnb, 6))
      }
    }
  }

  // 计算预计收到代币数或预计花费 BNB
  const inputNum = Number(inputValue) || 0
  const estimatedTokens =
    inputNum > 0 && priceNum > 0
      ? (inputNum / priceNum).toLocaleString(undefined, {
          maximumFractionDigits: 4,
        })
      : inputNum > 0
        ? '需先输入预售价'
        : '0'

  const estimatedBnbCost =
    inputNum > 0 && priceNum > 0
      ? formatCleanNumber(inputNum * priceNum, 6)
      : inputNum > 0
        ? '需先输入预售价'
        : '0'

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

      {/* 余额行 */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral-400">钱包可用余额：</span>
        <span className="font-mono font-medium text-white">
          {formattedBalance} BNB
        </span>
      </div>

      {/* 主输入框与右侧切换按钮（Figma 布局，未填预售价时锁定） */}
      <div className="flex flex-col gap-1">
        <div
          className={cn(
            'flex h-11 items-center justify-between border border-[#484b51] bg-[#141517] px-3 transition-colors',
            isPriceValid ? 'focus-within:border-[#FE810B]' : 'opacity-50 cursor-not-allowed bg-[#181a1d]',
            error && 'border-red-500',
          )}
        >
          {/* 左侧数值输入 */}
          <input
            type="text"
            inputMode="decimal"
            disabled={!isPriceValid}
            placeholder={!isPriceValid ? '请先在上方设置预售价' : ''}
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            className={cn(
              'w-full bg-transparent font-mono text-sm font-medium text-white placeholder:text-neutral-500 focus:outline-none',
              !isPriceValid && 'cursor-not-allowed text-neutral-500',
            )}
          />

          {/* 中间细分割线 */}
          <div className="mx-3 h-5 w-px shrink-0 bg-white/15" />

          {/* 右侧模式切换按钮 */}
          <button
            type="button"
            disabled={!isPriceValid}
            onClick={handleToggleMode}
            className={cn(
              'flex shrink-0 items-center gap-1.5 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white transition-all',
              isPriceValid
                ? 'cursor-pointer hover:bg-white/10 hover:text-[#FFA546] active:scale-95'
                : 'cursor-not-allowed opacity-50',
            )}
            title={isPriceValid ? '点击切换输入币种 (BNB / 代币)' : '请先设置预售价'}
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
        {error && <span className="text-[11px] text-red-500">{error}</span>}
      </div>

      {/* 快捷百分比按钮组 (25% / 50% / 75% / 100%) */}
      <div className="grid grid-cols-4 gap-2">
        {[25, 50, 75, 100].map((percent) => (
          <button
            key={percent}
            type="button"
            disabled={!isPriceValid}
            onClick={() => handlePercentClick(percent)}
            className={cn(
              'flex h-8 items-center justify-center border border-[#2F3737] bg-[#1a1c1e] text-xs font-semibold text-neutral-300 transition-all select-none',
              isPriceValid
                ? 'cursor-pointer hover:border-[#FE810B] hover:text-[#FFA546] active:scale-95'
                : 'cursor-not-allowed opacity-40',
            )}
          >
            {percent}%
          </button>
        ))}
      </div>

      {/* 底部换算与模式说明 */}
      <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-neutral-400">
        <div>
          {!isPriceValid ? (
            <span className="flex items-center gap-1 text-amber-400/90">
              <Lock className="size-3" />
              需先在上方设置预售价，方可配置购买金额
            </span>
          ) : mode === 'BNB' ? (
            <span>
              预计获得：
              <strong className="font-mono text-white">
                {estimatedTokens}
              </strong>{' '}
              代币
            </span>
          ) : (
            <span>
              预计需支付：
              <strong className="font-mono text-white">
                {estimatedBnbCost}
              </strong>{' '}
              BNB
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-neutral-500">
          <Info className="size-3 text-neutral-500" />
          <span>{mode === 'BNB' ? '随行就市模式' : '目标精确买入'}</span>
        </div>
      </div>
    </div>
  )
}
