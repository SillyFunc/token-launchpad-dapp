import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useConnection, useConfig } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import {
  signMessage,
  writeContract,
  readContract,
  waitForTransactionReceipt,
  switchChain,
} from '@wagmi/core'
import { parseEther, type Abi } from 'viem'
import {
  Coins,
  Rocket,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

import type { TokenDetail } from '@/api/token'
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
import { formatAddress } from '@/lib/format'
import { useTokenGate } from '@/hooks/use-token-gate'
import {
  DEFAULT_CHAIN_ID,
  getContractAddresses,
  getTargetChainName,
} from '@/config/network'
import CoordinatorFactoryAbiJson from '@/contracts/abi/CoordinatorFactory.json'
import PresaleAbiJson from '@/contracts/abi/Presale.json'

const CoordinatorFactoryAbi = CoordinatorFactoryAbiJson as unknown as Abi
const PresaleAbi = PresaleAbiJson as unknown as Abi

const KNOWN_ERRORS: Record<string, string> = {
  TokenNotRegistered: '代币未在本平台登记',
  NotTokenCreator: '仅代币创建者可操作',
  AlreadyConfigured: '预售条款已在链上配置，不可重复修改',
  InvalidPrice: '预售价必须大于 0',
  InvalidMaxBuyPerWallet: '单钱包上限必须大于 0',
  CreatorBuyTokensWithoutFunding: '设置了代币购买目标但未附带购买注资',
  InvalidVestingDelay: '释放周期须在 7 至 90 天之间',
  InvalidVestingRate: '释放比例须在 5% 至 20% 之间',
  SlippageTooHigh: '滑点不能超过 10%',
  SoftCapTooLow: '软顶须不小于加池下限',
  PresaleNotOpen: '预售未开放',
  NoTokensToClaim: '托管仓无代币余额',
}

function parseContractError(err: unknown): string {
  if (err instanceof Error || (err && typeof err === 'object')) {
    const msg =
      err instanceof Error
        ? err.message
        : String((err as { shortMessage?: string }).shortMessage ?? err)

    if (msg.includes('User rejected') || msg.includes('rejected the request')) {
      return '用户已取消交易'
    }
    if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) {
      return '钱包 BNB 余额不足'
    }
    if (msg.includes('Ownable: caller is not the owner')) {
      return '仅代币所有者可操作'
    }
    if (msg.includes('gas limit too high') || msg.includes('gas required exceeds')) {
      return '链上模拟执行失败（合约校验不通过，请检查是否已配置过或参数是否满足约束）'
    }
    for (const [name, text] of Object.entries(KNOWN_ERRORS)) {
      if (msg.includes(name)) return text
    }
    return (err as { shortMessage?: string }).shortMessage || msg
  }
  return '开启预售失败，请稍后重试'
}

export interface OpenPresaleModalProps {
  token: TokenDetail
  onClose: () => void
  onSuccess: () => void
}

export function OpenPresaleModal({
  token,
  onClose,
  onSuccess,
}: OpenPresaleModalProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { address } = useConnection()
  const config = useConfig()
  const { presaleAddress, presaleConfigured } = useTokenGate({ token })

  const [isExecuting, setIsExecuting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const tokenAddress = token.coinContractAddress || ''

  const handleExecute = async () => {
    if (!address) {
      toast.error('请先连接钱包')
      return
    }

    if (!presaleAddress) {
      toast.error('未找到该代币的托管仓合约')
      return
    }

    // 确保钱包处于目标网络
    if (config.state.chainId !== DEFAULT_CHAIN_ID) {
      try {
        await switchChain(config, { chainId: DEFAULT_CHAIN_ID })
      } catch {
        toast.error(
          `请在钱包中切换网络至 ${getTargetChainName(DEFAULT_CHAIN_ID)}`,
        )
        return
      }
    }

    setIsExecuting(true)
    try {
      const coordinator =
        getContractAddresses(DEFAULT_CHAIN_ID).coordinatorFactory

      // 实时查询链上是否已经执行过 setupPresale
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

      // ① 若链上尚未执行 setupPresale，先同步链上条款
      if (!isConfiguredOnChain) {
        const hardcapWei = parseEther(String(token.hardcap || '0'))
        const softcapWei = parseEther(
          String(token.softcap || token.soft || '0'),
        )
        const minLiquidityWei = softcapWei
        const priceWei = parseEther(
          String(token.presaleTokenPrice || '0.001'),
        )
        const maxBuyWei = parseEther(
          String(token.maxBuyPerWallet || '1000'),
        )

        // 释放周期换算：若大于 90 说明已是秒，否则作为天数换算为秒
        const rawDelay = Number(token.vestingDelay) || 7
        const vestingDelaySec =
          rawDelay > 90 ? BigInt(rawDelay) : BigInt(rawDelay) * 86400n

        const creatorBuyTokensWei = parseEther(
          String(token.creatorBuyTokens || '0'),
        )
        let creatorBuyBnbWei = parseEther(
          String(token.creatorBuyBnb || '0'),
        )

        // 防呆：若设置了购买代币目标但未填注资，自动按价格预估注资，防止合约报 CreatorBuyTokensWithoutFunding
        if (creatorBuyTokensWei > 0n && creatorBuyBnbWei <= 0n) {
          creatorBuyBnbWei =
            (creatorBuyTokensWei * priceWei) / 1000000000000000000n
        }

        const startTime = BigInt(Number(token.startTime || 0))

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
              startTime,
              vestingDelay: vestingDelaySec,
              vestingRate: BigInt(Number(token.vestingRate || 10)),
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
      }

      // ② 调用 presale.openPresale() 开启认购
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
    ? `${token.maxBuyPerWallet} 枚`
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
            此操作将在区块链上锁定预售条款并启动认购，操作不可撤销，请核对参数。
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
                预售一旦开启，预售条款将永久写入区块链且不可修改。认购期内散户即可存入
                BNB 参与认购。
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
              <Button
                type="button"
                size="default"
                disabled={isExecuting}
                onClick={handleExecute}
                className="border-transparent bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5 disabled:opacity-50"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>开启中…</span>
                  </>
                ) : (
                  <>
                    <Rocket className="size-3.5" />
                    <span>确认并开启预售</span>
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
