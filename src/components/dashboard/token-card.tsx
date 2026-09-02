import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConnection, useConfig } from 'wagmi'
import { signMessage, writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { type Abi } from 'viem'
import {
  Coins,
  Copy,
  Check,
  ExternalLink,
  Edit3,
  Gift,
  Rocket,
  Loader2,
  Globe,
  Send,
  Clock,
  ShieldCheck,
  Percent,
  Wallet,
} from 'lucide-react'

import type { TokenDetail } from '@/api/token'
import { getSignMessage } from '@/api/auth'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { formatAddress } from '@/lib/format'
import PresaleAbiJson from '@/contracts/abi/Presale.json'
import { useTokenGate } from '@/hooks/use-token-gate'
import { DEFAULT_CHAIN_ID, getExplorerUrl } from '@/config/network'

const PresaleAbi = PresaleAbiJson as unknown as Abi

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export interface TokenCardProps {
  token: TokenDetail
  totalSupplyText: string
  onEdit: (token: TokenDetail) => void
  onPresale: (token: TokenDetail) => void
  onLaunch: (token: TokenDetail) => void
  onClaim: (token: TokenDetail) => void
}

export function TokenCard({
  token,
  totalSupplyText,
  onEdit,
  onPresale,
  onLaunch,
  onClaim,
}: TokenCardProps) {
  const { address: connectedAddress } = useConnection()
  const config = useConfig()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)

  // 统一代币门禁守卫
  const {
    isIssued,
    presaleAddress,
    tokensClaimed,
    canEdit,
    canIssue,
    canClaimAll,
    canSetupPresale,
  } = useTokenGate({ token })

  const tokenAddress = token.coinContractAddress || ''

  const handleCopy = () => {
    if (!tokenAddress) return
    void navigator.clipboard.writeText(tokenAddress)
    setCopied(true)
    toast.success('已复制到剪贴板')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClaimTokens = async () => {
    if (!canClaimAll.allowed) {
      toast.error(canClaimAll.reason || '当前不可领取代币')
      return
    }
    if (!connectedAddress || !presaleAddress) return

    setIsClaiming(true)
    try {
      const message = await getSignMessage(connectedAddress)
      await signMessage(config, { message })
      const hash = await writeContract(config, {
        address: presaleAddress,
        abi: PresaleAbi,
        functionName: 'claimAllTokens',
        chainId: DEFAULT_CHAIN_ID,
      })
      await waitForTransactionReceipt(config, { hash, chainId: DEFAULT_CHAIN_ID })
      queryClient.invalidateQueries()
      toast.success('请关注您钱包里的代币余额', '领取成功')
      onClaim(token)
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : '代币领取失败，请稍后重试'
      toast.error(msg, '领取失败')
    } finally {
      setIsClaiming(false)
    }
  }

  const handlePresaleClick = () => {
    if (!canSetupPresale.allowed && canSetupPresale.reason) {
      toast.warning(canSetupPresale.reason)
    }
    onPresale(token)
  }

  return (
    <Card className="flex flex-col justify-between overflow-hidden rounded-lg border border-[#484b51] bg-[#131516] p-0 text-white shadow-lg transition-all hover:border-[#FE810B]/60">
      <div>
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-[#2F3737] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#484b51] bg-[#1a1c1e]">
              {token.coinImg ? (
                <img
                  src={token.coinImg}
                  alt={token.name}
                  className="size-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <Coins className="size-6 text-[#FFA546]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <CardTitle className="truncate text-base font-bold text-white">
                  {token.name}
                </CardTitle>
                <span className="shrink-0 rounded bg-[#FE810B]/15 px-2 py-0.5 text-xs font-semibold text-[#FFA546]">
                  &#36;{token.symbol}
                </span>
              </div>
              <CardDescription className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                <span>
                  CA: {tokenAddress ? formatAddress(tokenAddress) : '暂未发行'}
                </span>
                {tokenAddress && (
                  <>
                    <button
                      type="button"
                      aria-label="复制地址"
                      onClick={handleCopy}
                      className="cursor-pointer text-neutral-400 transition-colors hover:text-white"
                    >
                      {copied ? (
                        <Check className="size-3 text-green-400" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                    <a
                      href={getExplorerUrl(tokenAddress, 'address')}
                      target="_blank"
                      rel="noreferrer"
                      className="text-neutral-400 transition-colors hover:text-[#FFA546]"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  </>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 p-4">
          <p className="min-h-8 text-xs text-neutral-400 line-clamp-2">
            {token.meta || token.zhIntroduction || '暂无代币描述信息'}
          </p>

          <div className="flex flex-col divide-y divide-[#2F3737]/60 rounded-md border border-[#2F3737] bg-[#17191b] px-3 py-1 text-xs">
            <div className="flex items-center justify-between py-2">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <Percent className="size-3.5 text-[#FE810B]" />
                买入 / 卖出税率
              </span>
              <span className="font-semibold text-white">
                {token.buyTax ?? 0}% / {token.sellTax ?? 0}%
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <Clock className="size-3.5 text-[#FE810B]" />
                税费存续期
              </span>
              <span className="font-semibold text-white">
                {token.taxDuration ? `${token.taxDuration} 天` : '--'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <ShieldCheck className="size-3.5 text-[#FE810B]" />
                防「挖、提、卖」保护期
              </span>
              <span className="font-semibold text-white">
                {token.antiFarmerDuration !== undefined &&
                token.antiFarmerDuration !== null
                  ? `${token.antiFarmerDuration} 天`
                  : '--'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <Coins className="size-3.5 text-[#FE810B]" />
                发行总量
              </span>
              <span
                className={
                  token.coinContractAddress
                    ? 'font-semibold text-white'
                    : 'font-normal text-neutral-400'
                }
              >
                {token.coinContractAddress ? totalSupplyText : '暂未发行'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="flex items-center gap-1.5 text-neutral-400">
                <Wallet className="size-3.5 text-[#FE810B]" />
                税费接收地址
              </span>
              <span className="font-mono text-white">
                {formatAddress(token.feeRecipient)}
              </span>
            </div>
          </div>

          {(token.website || token.twitter || token.telegram) && (
            <div className="flex items-center gap-3 pt-1 text-xs text-neutral-400">
              {token.website && (
                <a
                  href={token.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 transition-colors hover:text-[#FFA546]"
                >
                  <Globe className="size-3.5" />
                  <span>官网</span>
                </a>
              )}
              {token.twitter && (
                <a
                  href={token.twitter}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 transition-colors hover:text-[#FFA546]"
                >
                  <TwitterIcon className="size-3.5" />
                  <span>Twitter</span>
                </a>
              )}
              {token.telegram && (
                <a
                  href={token.telegram}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 transition-colors hover:text-[#FFA546]"
                >
                  <Send className="size-3.5" />
                  <span>TG 频道</span>
                </a>
              )}
            </div>
          )}
        </CardContent>
      </div>

      {(isIssued ? canClaimAll.allowed || !tokensClaimed : true) && (
        <CardFooter className="flex items-center justify-end gap-2.5 border-t border-[#2F3737] bg-[#16181a] p-3">
          {!isIssued && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!canEdit.allowed) {
                  toast.error(canEdit.reason || '无法编辑代币资料')
                  return
                }
                onEdit(token)
              }}
              disabled={!canEdit.allowed}
              className="h-8 cursor-pointer rounded border-[#484b51] bg-[#1a1c1e] text-xs font-semibold text-neutral-200 hover:bg-[#25282c] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Edit3 className="size-3.5" />
              编辑信息
            </Button>
          )}
          {isIssued ? (
            <>
              {canClaimAll.allowed && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClaimTokens}
                  disabled={isClaiming}
                  className="h-8 cursor-pointer rounded border-[#484b51] bg-[#1a1c1e] text-xs font-semibold text-neutral-200 hover:bg-[#25282c] hover:text-white"
                >
                  {isClaiming ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Gift className="size-3.5" />
                  )}
                  {isClaiming ? '领取中…' : '领取代币'}
                </Button>
              )}
              {!tokensClaimed && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handlePresaleClick}
                  className="h-8 cursor-pointer rounded bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white transition-transform active:translate-y-0.5"
                >
                  <Rocket className="size-3.5" />
                  我要预售
                </Button>
              )}
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (!canIssue.allowed) {
                  toast.error(canIssue.reason || '无法发行代币')
                  return
                }
                onLaunch(token)
              }}
              disabled={!canIssue.allowed}
              className="h-8 cursor-pointer rounded border border-white/40 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white transition-transform active:translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Rocket className="size-3.5" />
              我要发行
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  )
}
