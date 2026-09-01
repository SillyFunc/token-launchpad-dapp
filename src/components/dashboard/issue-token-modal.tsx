import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useConnection, useConfig } from 'wagmi'
import { signMessage } from '@wagmi/core'
import { type Hex } from 'viem'
import {
  Coins,
  Rocket,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

import { parseTxHash, type TokenDetail } from '@/api/token'
import { getSignMessage } from '@/api/auth'
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

function formatAddress(addr?: string): string {
  if (!addr) return '--'
  if (addr.length <= 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

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
  onSuccess: () => void
}

export function IssueTokenModal({
  token,
  onClose,
  onSuccess,
}: IssueTokenModalProps) {
  const navigate = useNavigate()
  const { address } = useConnection()
  const config = useConfig()
  const { formattedFee } = useCreationFee()
  const { execute: createToken } = useCreateToken()

  const [copied, setCopied] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [issuedTokenAddress, setIssuedTokenAddress] = useState<Hex | null>(null)

  const isIssued = issuedTokenAddress !== null

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('已复制到剪贴板')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExecute = async () => {
    if (!address) {
      toast.error('请先连接钱包')
      return
    }

    setIsExecuting(true)
    try {
      const message = await getSignMessage(address)
      const signature = await signMessage(config, { message })

      const result = await createToken({
        name: token.name,
        symbol: token.symbol,
        meta: token.meta || token.zhIntroduction || '',
        buyTax: token.buyTax ?? 0,
        sellTax: token.sellTax ?? 0,
        feeRecipient:
          (token.feeRecipient as Hex) ||
          '0x0000000000000000000000000000000000000000',
        taxDurationDays: Number(token.taxDuration) || 30,
        antiFarmerDurationDays: Number(token.antiFarmerDuration) || 0,
        salt: token.salt ? (token.salt as Hex) : undefined,
      })

      if (token.id && result.txHash) {
        try {
          await parseTxHash({
            id: token.id,
            hash: result.txHash,
            address,
            message,
            signature,
          })
        } catch (e) {
          console.error('Failed to sync tx hash to backend', e)
        }
      }

      setIssuedTokenAddress(result.tokenAddress)
      toast.success('代币已成功发行到区块链！')
      onSuccess()
    } catch (err: unknown) {
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
                BSC Testnet (ChainId: 97)
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-neutral-400">预估发行费用</span>
              <span className="font-bold text-[#FFA546]">
                {formattedFee ? `${formattedFee} BNB` : '0.005 BNB'}
              </span>
            </div>
          </div>

          {!isIssued && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
              <span>
                链上发行后合约参数将写入区块链且不可更改，请确认钱包留有足够的
                BNB 支付 Gas 费。
              </span>
            </div>
          )}

          {isIssued && issuedTokenAddress && (
            <div className="flex flex-col gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-xs text-green-400">
              <div className="flex items-center gap-2 font-bold text-sm text-green-300">
                <CheckCircle2 className="size-4" />
                <span>代币已成功发行到区块链！</span>
              </div>
              <div className="mt-1 flex items-center justify-between rounded bg-black/40 px-2.5 py-1.5 text-neutral-200">
                <span className="text-neutral-400">代币 CA：</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span>{formatAddress(issuedTokenAddress)}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(issuedTokenAddress)}
                    className="cursor-pointer text-neutral-400 hover:text-white"
                  >
                    {copied ? (
                      <Check className="size-3.5 text-green-400" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                  <a
                    href={`https://testnet.bscscan.com/address/${issuedTokenAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-400 hover:text-white"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-end gap-2 border-t border-[#2F3737] px-5 py-3">
          {isIssued ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="rounded border-[#484b51] bg-[#1a1c1e] text-xs text-neutral-300 hover:bg-[#25282c]"
              >
                完成关闭
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onClose()
                  navigate(`/presale?address=${issuedTokenAddress}`)
                }}
                className="flex items-center gap-1.5 rounded border border-white/40 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white shadow-[0_2px_0_0_#963000]"
              >
                <Rocket className="size-3.5" />
                立即前往预售
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isExecuting}
                onClick={onClose}
                className="rounded border-[#484b51] bg-[#1a1c1e] text-xs text-neutral-300 hover:bg-[#25282c]"
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isExecuting}
                onClick={handleExecute}
                className="flex items-center gap-1.5 rounded border border-white/40 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>处理中…</span>
                  </>
                ) : (
                  <>
                    <Rocket className="size-3.5" />
                    <span>确认并上链发行</span>
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
