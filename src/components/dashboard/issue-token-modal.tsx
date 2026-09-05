import { useState } from 'react'
import { useConnection, useConfig } from 'wagmi'
import { type Hex, zeroAddress } from 'viem'
import {
  Coins,
  Rocket,
  Loader2,
  AlertTriangle,
} from 'lucide-react'

import { parseTxHash, type TokenDetail } from '@/api/token'
import { requestAuthSignature } from '@/api/auth'
import {
  useCreateToken,
  useCreationFee,
  CoordinatorError,
  type CoordinatorErrorCode,
} from '@/hooks/use-coordinator'
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
  getTargetChainName,
} from '@/config/network'

const ERROR_MESSAGES: Record<CoordinatorErrorCode, string> = {
  USER_REJECTED: '用户已取消交易',
  INSUFFICIENT_FUNDS: '钱包 BSC 测试网 tBNB 余额不足，请领取测试币后再试',
  WRONG_NETWORK: '请在钱包中切换网络至 BSC 测试网 (BNB Smart Chain Testnet)',
  INVALID_PARAMS: '合约参数校验失败，请检查税费存续期与保护期设置',
  EVENT_NOT_FOUND: '交易已确认，但未解析到代币创建事件',
  EMPTY_TOKEN_NAME: '代币名称不能为空',
  EMPTY_TOKEN_SYMBOL: '代币符号不能为空',
  INSUFFICIENT_CREATION_FEE: '创建费用不足',
  ZERO_CREATION_FEE: '创建费用为零，请联系管理员',
  FACTORY_DISABLED: '合约工厂已被禁用',
  INVALID_SALT: '保留盐值无效',
  ADDRESS_ALREADY_DEPLOYED: '该代币地址已部署',
  ADDRESS_ALREADY_RESERVED: '该代币地址已被保留',
  TOKEN_CREATION_FAILED: '代币创建失败',
  ETH_TRANSFER_FAILED: 'BNB 转账失败',
  INVALID_FEE_RECIPIENT: '税费接收地址无效',
}

function toErrorMessage(err: unknown): string {
  if (err instanceof CoordinatorError) {
    return ERROR_MESSAGES[err.code] ?? '发行失败，请稍后重试'
  }
  return err instanceof Error ? err.message : '发行失败，请稍后重试'
}

export interface IssueTokenModalProps {
  token: TokenDetail
  onClose: () => void
  onSuccess: (tokenAddress: Hex) => void
}

export function IssueTokenModal({
  token,
  onClose,
  onSuccess,
}: IssueTokenModalProps) {
  const { address } = useConnection()
  const config = useConfig()
  const { formattedFee } = useCreationFee()
  const { execute: createToken } = useCreateToken()
  const { canIssue } = useTokenGate({ token })

  const [isExecuting, setIsExecuting] = useState(false)

  const handleExecute = async () => {
    if (!canIssue.allowed) {
      toast.error(canIssue.reason || '当前代币不可发行')
      return
    }
    if (!address) {
      toast.error('请先连接钱包')
      return
    }

    setIsExecuting(true)
    try {
      const auth = await requestAuthSignature(config, address)

      const result = await createToken({
        name: token.name,
        symbol: token.symbol,
        meta: token.meta || token.zhIntroduction || '',
        buyTax: token.buyTax ?? 0,
        sellTax: token.sellTax ?? 0,
        feeRecipient: (token.feeRecipient as Hex) || zeroAddress,
        taxDurationDays: Number(token.taxDuration) || 30,
        antiFarmerDurationDays: Number(token.antiFarmerDuration) || 0,
        salt: token.salt ? (token.salt as Hex) : undefined,
      })

      if (token.id && result.txHash) {
        try {
          await parseTxHash({
            id: token.id,
            hash: result.txHash,
            ...auth,
          })
        } catch (e) {
          console.error('Failed to sync tx hash to backend', e)
        }
      }

      toast.success('代币发行成功！')
      onSuccess(result.tokenAddress)
      onClose()
    } catch (err: unknown) {
      onClose()
      toast.error(toErrorMessage(err), '发行失败')
    } finally {
      setIsExecuting(false)
    }
  }

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
              发行代币到区块链
            </DialogTitle>
          </div>
          <DialogDescription className="mt-1 text-xs text-neutral-400">
            此操作将在区块链上部署智能合约，操作不可撤销，请核对参数。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col space-y-4 overflow-y-auto px-5 py-4">
          {/* 代币概览横幅 */}
          <div className="flex items-center gap-3 rounded-lg border border-[#2F3737] bg-[#181a1d] p-3">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#484b51] bg-[#1a1c1e]">
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
                <span className="rounded bg-[#FE810B]/15 px-1.5 py-0.5 text-xs font-semibold text-[#FFA546]">
                  &#36;{token.symbol}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-neutral-400">
                {token.meta || token.zhIntroduction || '暂无代币描述'}
              </p>
            </div>
          </div>

          <div className="flex flex-col divide-y divide-[#2F3737] rounded-lg border border-[#2F3737] bg-[#181a1d] px-3.5 text-xs">
            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">买入 / 卖出税率</span>
              <span className="font-semibold text-white">
                {token.buyTax ?? 0}% / {token.sellTax ?? 0}%
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">税费存续期</span>
              <span className="font-semibold text-white">
                {token.taxDuration ? `${token.taxDuration} 天` : '30 天'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">防「挖、提、卖」保护期</span>
              <span className="font-semibold text-white">
                {token.antiFarmerDuration !== undefined &&
                token.antiFarmerDuration !== null
                  ? `${token.antiFarmerDuration} 天`
                  : '0 天'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">税费接收地址</span>
              <span className="font-mono text-white">
                {formatAddress(token.feeRecipient)}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">发行网络</span>
              <span className="font-semibold text-white">
                {getTargetChainName(DEFAULT_CHAIN_ID)}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">预估发行费用</span>
              <span className="font-bold text-[#FFA546]">
                {formattedFee ? `${formattedFee} BNB` : '0.005 BNB'}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <span>
              链上发行后合约参数将写入区块链且不可更改，请确认钱包留有足够的
              BNB 支付 Gas 费。
            </span>
          </div>

        </div>

        <DialogFooter className="flex flex-row items-center justify-end gap-2 border-t border-[#2F3737] px-5 py-3">
          {/*<Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isExecuting}
            onClick={onClose}
            className="rounded border-[#484b51] bg-[#1a1c1e] text-xs text-neutral-300 hover:bg-[#25282c]"
          >
            取消
          </Button>*/}
          <Button
            type="button"
            size="sm"
            disabled={isExecuting || !canIssue.allowed}
            onClick={handleExecute}
            className="flex items-center gap-1.5 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white transition-transform active:translate-y-0.5 disabled:opacity-50"
          >
            {isExecuting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>发行中…</span>
              </>
            ) : (
              <>
                <Rocket className="size-3.5" />
                <span>确认发行</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
