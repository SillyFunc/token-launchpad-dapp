import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useConfig } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import {
  writeContract,
  readContract,
  waitForTransactionReceipt,
} from '@wagmi/core'
import {
  Coins,
  Rocket,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

import type { TokenDetail } from '@/api/token'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Web3ActionButton } from '@/components/common/web3-action-button'
import { toast } from '@/components/ui/toast'
import { formatAddress, formatNumber } from '@/lib/format'
import { useTokenGate } from '@/hooks/use-token-gate'
import {
  DEFAULT_CHAIN_ID,
  getContractAddresses,
  getTargetChainName,
} from '@/config/network'
import { CoordinatorFactoryAbi, PresaleAbi } from '@/contracts/abi'
import { parseContractError } from '@/lib/contract-error'

export interface OpenPresaleModalProps {
  token: TokenDetail
  onClose: () => void
  onSuccess: () => void
}

/**
 * 开启预售确认弹窗 — 专心调用托管仓 presale.openPresale() 开启认购
 */
export function OpenPresaleModal({
  token,
  onClose,
  onSuccess,
}: OpenPresaleModalProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const config = useConfig()
  const { presaleAddress, presaleConfigured } = useTokenGate({ token })

  const [isExecuting, setIsExecuting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const tokenAddress = token.coinContractAddress || ''

  const handleExecute = async () => {
    if (!presaleAddress) {
      toast.error('未找到该代币的托管仓合约')
      return
    }

    setIsExecuting(true)
    try {
      const coordinator =
        getContractAddresses(DEFAULT_CHAIN_ID).coordinatorFactory

      // 预检：若链上尚未配置预售，引导先去配置
      let isConfiguredOnChain = presaleConfigured
      try {
        isConfiguredOnChain = (await readContract(config, {
          address: coordinator,
          abi: CoordinatorFactoryAbi,
          functionName: 'tokenConfigured',
          args: [tokenAddress as `0x${string}`],
          chainId: DEFAULT_CHAIN_ID,
        })) as boolean
      } catch (readErr) {
        console.warn('Read tokenConfigured failed:', readErr)
      }

      if (!isConfiguredOnChain) {
        toast.warning('请先配置预售条款后再开启预售')
        navigate(`/presale?id=${token.id}&address=${tokenAddress}`)
        onClose()
        return
      }

      // 直接调用 presale.openPresale() 开启认购
      const openHash = await writeContract(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'openPresale',
        chainId: DEFAULT_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, {
        hash: openHash,
        chainId: DEFAULT_CHAIN_ID,
      })

      await queryClient.invalidateQueries()
      setIsSuccess(true)
      toast.success('预售已成功开启！现已开放散户认购')
      onSuccess()
    } catch (err: unknown) {
      toast.error(parseContractError(err), '开启失败')
    } finally {
      setIsExecuting(false)
    }
  }

  const presalePriceText = token.presaleTokenPrice
    ? `${token.presaleTokenPrice} BNB / 枚`
    : '--'

  const maxBuyText = token.maxBuyPerWallet
    ? `${formatNumber(token.maxBuyPerWallet)} 枚`
    : '--'

  const hardcapText = token.hardcap ? `${token.hardcap} BNB` : '不限'
  const softcapText =
    token.softcap || token.soft ? `${token.softcap || token.soft} BNB` : '--'

  const vestingText = `每 ${token.vestingDelay || 7} 天释放 ${token.vestingRate || 10}%`

  const creatorBuyText =
    Number(token.creatorBuyBnb) > 0
      ? `${token.creatorBuyBnb} BNB (随行就市)`
      : Number(token.creatorBuyTokens) > 0
        ? `${token.creatorBuyTokens} 枚代币 (精确买入)`
        : '不参与购买'

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => !open && !isExecuting && onClose()}
    >
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-md flex-col overflow-hidden border border-[#484b51] bg-[#131516] p-0 text-white shadow-2xl">
        <DialogHeader className="border-b border-[#2F3737] px-5 py-4">
          <div className="flex items-center gap-2">
            <Rocket className="size-4 text-[#FE810B]" />
            <DialogTitle className="text-base font-bold text-white">
              开启代币预售
            </DialogTitle>
          </div>
          <DialogDescription className="mt-1 text-xs text-neutral-400">
            此操作将正式开启预售认购通道，散户即可注入 BNB 认购代币。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col space-y-4 overflow-y-auto px-5 py-4">
          {/* 代币概览横幅 */}
          <div className="flex items-center gap-3 border border-[#2F3737] bg-[#181a1d] p-3">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden border border-[#484b51] bg-[#1a1c1e]">
              {token.coinImg ? (
                <img
                  src={token.coinImg}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <Coins className="size-6 text-[#FFA546]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-bold text-white">
                  {token.name}
                </span>
                <span className="bg-[#FE810B]/15 px-1.5 py-0.5 text-xs font-semibold text-[#FFA546]">
                  &#36;{token.symbol}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-neutral-400">
                CA: {tokenAddress ? formatAddress(tokenAddress) : '暂未发行'}
              </p>
            </div>
          </div>

          {/* 预售参数核对清单 */}
          <div className="flex flex-col divide-y divide-[#2F3737] border border-[#2F3737] bg-[#181a1d] px-3.5 text-xs">
            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">预售价</span>
              <span className="font-mono font-semibold text-white">
                {presalePriceText}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">单钱包认购上限</span>
              <span className="font-mono font-semibold text-white">
                {maxBuyText}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">募资硬顶 (Hard Cap)</span>
              <span className="font-mono font-semibold text-white">
                {hardcapText}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">预售成功软顶 (Soft Cap)</span>
              <span className="font-mono font-semibold text-white">
                {softcapText}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">锁仓释放节奏</span>
              <span className="font-mono font-semibold text-white">
                {vestingText}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">创建者代币购买</span>
              <span className="font-mono font-semibold text-white">
                {creatorBuyText}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">预售网络</span>
              <span className="font-semibold text-white">
                {getTargetChainName(DEFAULT_CHAIN_ID)}
              </span>
            </div>
          </div>

          {!isSuccess && (
            <div className="flex items-start gap-2 border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
              <span>
                预售开启后即刻接受散户认购，达到软顶后即可结束认购并一键加池开盘。
              </span>
            </div>
          )}

          {isSuccess && (
            <div className="flex flex-col gap-2 border border-green-500/30 bg-green-500/10 p-4 text-xs text-green-400">
              <div className="flex items-center gap-2 text-sm font-bold text-green-300">
                <CheckCircle2 className="size-4" />
                <span>预售已成功在区块链上开启！</span>
              </div>
              <p className="text-neutral-300">
                您的代币预售已处于「认购中」状态，社区用户现在可以参与认购。
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-end gap-2 border-t border-[#2F3737] px-5 py-3">
          {isSuccess ? (
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={onClose}
            >
              完成关闭
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="default"
                disabled={isExecuting}
                onClick={onClose}
              >
                取消
              </Button>
              <Web3ActionButton
                type="button"
                size="default"
                onAction={handleExecute}
                loading={isExecuting}
                loadingText="开启中…"
                className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5 disabled:opacity-50"
              >
                <Rocket className="size-3.5" />
                <span>确认并开启预售</span>
              </Web3ActionButton>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
