import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useConnection, useConfig } from 'wagmi'
import { signMessage } from '@wagmi/core'
import { isAddress, type Hex } from 'viem'
import { ConnectKitButton } from 'connectkit'
import {
  Coins,
  Copy,
  Check,
  ExternalLink,
  Edit3,
  Rocket,
  RefreshCw,
  Globe,
  Send,
  Clock,
  ShieldCheck,
  Percent,
  Wallet,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

import {
  getTokensByCreator,
  saveTokenInfo,
  uploadTokenLogo,
  parseTxHash,
  type TokenDetail,
} from '@/api/token'
import { getSignMessage } from '@/api/auth'
import { useCreateToken, useCreationFee } from '@/hooks/use-coordinator'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import titleBackArrow from '@/assets/icons/back-arrow.svg'

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

function formatAddress(addr?: string): string {
  if (!addr) return '--'
  if (addr.length <= 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function TokenCard({
  token,
  onEdit,
  onPresale,
  onLaunch,
}: {
  token: TokenDetail
  onEdit: (token: TokenDetail) => void
  onPresale: (token: TokenDetail) => void
  onLaunch: (token: TokenDetail) => void
}) {
  const [copied, setCopied] = useState(false)
  const isIssued = Boolean(token.coinContractAddress)
  const tokenAddress = token.coinContractAddress || ''

  const handleCopy = () => {
    if (!tokenAddress) return
    void navigator.clipboard.writeText(tokenAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="flex flex-col justify-between overflow-hidden rounded-lg border border-[#484b51] bg-[#131516] p-0 text-white shadow-lg transition-all hover:border-[#FE810B]/60">
      <div>
        {/* 卡片头部 */}
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
                  {token.symbol}
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
                      href={`https://testnet.bscscan.com/address/${tokenAddress}`}
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

        {/* 卡片内容 */}
        <CardContent className="space-y-3 p-4">
          {/* 代币描述 */}
          <p className="min-h-8 text-xs text-neutral-400 line-clamp-2">
            {token.meta || token.zhIntroduction || '暂无代币描述信息'}
          </p>

          {/* 核心指标参数：一行一条 */}
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
                {token.coinContractAddress
                  ? (token.totalIssuance ?? token.totalSupply ?? '10 亿')
                  : '暂未发行'}
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

          {/* 社交链接 */}
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

      {/* 卡片操作按钮 */}
      <CardFooter className="flex items-center justify-end gap-2.5 border-t border-[#2F3737] bg-[#16181a] p-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onEdit(token)}
          className="cursor-pointer rounded border-[#484b51] bg-[#1a1c1e] text-xs font-semibold text-neutral-200 hover:bg-[#25282c] hover:text-white"
        >
          <Edit3 className="size-3.5" />
          编辑信息
        </Button>
        {isIssued ? (
          <Button
            type="button"
            size="sm"
            onClick={() => onPresale(token)}
            className="cursor-pointer rounded border border-white/40 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5"
          >
            <Rocket className="size-3.5" />
            我要预售
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => onLaunch(token)}
            className="cursor-pointer rounded border border-white/40 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5"
          >
            <Rocket className="size-3.5" />
            我要发行
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

function EditInfoModal({
  token,
  onClose,
  onSuccess,
}: {
  token: TokenDetail
  onClose: () => void
  onSuccess: () => void
}) {
  const { address } = useConnection()
  const config = useConfig()

  // 表单状态
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(
    token.coinImg || null,
  )
  const [name, setName] = useState(token.name ?? '')
  const [symbol, setSymbol] = useState(token.symbol ?? '')
  const [description, setDescription] = useState(
    token.meta ?? token.zhIntroduction ?? '',
  )
  const [buyTax, setBuyTax] = useState<number>(token.buyTax ?? 0)
  const [sellTax, setSellTax] = useState<number>(token.sellTax ?? 0)
  const [taxDuration, setTaxDuration] = useState<number>(
    Number(token.taxDuration) || 30,
  )
  const [antiFarmerDuration, setAntiFarmerDuration] = useState<number>(
    Number(token.antiFarmerDuration) || 0,
  )
  const [feeRecipient, setFeeRecipient] = useState(
    token.feeRecipient || address || '',
  )
  const [telegram, setTelegram] = useState(token.telegram ?? '')
  const [twitter, setTwitter] = useState(token.twitter ?? '')
  const [website, setWebsite] = useState(token.website ?? '')

  const [errorMsg, setErrorMsg] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(
    () => () => {
      if (logoPreview && logoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreview)
      }
    },
    [logoPreview],
  )

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) {
      setErrorMsg('文件大小不能超过 3 MB')
      return
    }
    setErrorMsg('')
    if (logoPreview && logoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(logoPreview)
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address) {
      setErrorMsg('请先连接钱包')
      return
    }
    if (!name.trim()) {
      setErrorMsg('请输入代币名称')
      return
    }
    if (!symbol.trim()) {
      setErrorMsg('请输入代币符号')
      return
    }
    if (!feeRecipient.trim() || !isAddress(feeRecipient.trim())) {
      setErrorMsg('请输入合法的 EVM 税费接收地址')
      return
    }

    setErrorMsg('')
    setIsSubmitting(true)
    try {
      let coinImg = token.coinImg || ''
      if (logoFile) {
        coinImg = await uploadTokenLogo(logoFile)
      }
      const message = await getSignMessage(address)
      const signature = await signMessage(config, { message })
      await saveTokenInfo({
        name: name.trim(),
        coinImg,
        symbol: symbol.trim(),
        meta: description.trim(),
        buyTax,
        sellTax,
        feeRecipient: feeRecipient.trim(),
        taxDuration: Number(taxDuration) || 30,
        antiFarmerDuration: Number(antiFarmerDuration) || 0,
        liqExpectedOutputAmount: 0,
        launchType: token.launchType || 2,
        website: website.trim(),
        telegram: telegram.trim(),
        twitter: twitter.trim(),
        address,
        message,
        signature,
      })
      setIsSaved(true)
      onSuccess()
      setTimeout(() => {
        onClose()
      }, 800)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : '保存失败，请稍后重试'
      setErrorMsg(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-md flex-col overflow-hidden border border-[#484b51] bg-[#131516] p-0 text-white shadow-2xl">
        <DialogHeader className="border-b border-[#2F3737] px-5 py-4">
          <div className="flex items-center gap-2">
            <Edit3 className="size-4 text-[#FE810B]" />
            <DialogTitle className="text-base font-bold text-white">
              编辑代币信息
            </DialogTitle>
          </div>
          <DialogDescription className="mt-1 text-xs text-neutral-400">
            修改 {token.name} ({token.symbol}) 的基本资料与合约参数
          </DialogDescription>
        </DialogHeader>

        {/* 紧凑弹窗表单 */}
        <form
          onSubmit={handleSave}
          className="flex flex-1 flex-col space-y-4 overflow-y-auto px-5 py-4"
        >
          {/* Logo 与基本名称行 */}
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex size-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-[#484b51] bg-[#1a1c1e] transition-colors hover:border-[#FE810B]"
            >
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <Coins className="size-6 text-[#FE810B]" />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                更换
              </span>
            </button>
            <div className="grid flex-1 grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-400">代币名称 *</label>
                <input
                  type="text"
                  maxLength={24}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 w-full rounded-xs border border-[#484b51] bg-[#1a1c1e] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-400">代币符号 *</label>
                <input
                  type="text"
                  maxLength={15}
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="h-8 w-full rounded-xs border border-[#484b51] bg-[#1a1c1e] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 代币描述 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">代币描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="请输入代币描述..."
              className="w-full resize-none rounded-xs border border-[#484b51] bg-[#1a1c1e] p-2.5 text-xs text-white placeholder:text-neutral-600 focus:border-[#FE810B] focus:outline-none"
            />
          </div>

          {/* 税率与期限参数（紧凑网格） */}
          <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-[#2F3737] bg-[#17191b] p-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400">买入税率 (%)</label>
              <input
                type="number"
                min={0}
                max={10}
                value={buyTax}
                onChange={(e) => setBuyTax(Number(e.target.value))}
                className="h-8 w-full rounded-xs border border-[#484b51] bg-[#141517] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400">卖出税率 (%)</label>
              <input
                type="number"
                min={0}
                max={10}
                value={sellTax}
                onChange={(e) => setSellTax(Number(e.target.value))}
                className="h-8 w-full rounded-xs border border-[#484b51] bg-[#141517] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400">税费存续期 (天)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={taxDuration}
                onChange={(e) => setTaxDuration(Number(e.target.value))}
                className="h-8 w-full rounded-xs border border-[#484b51] bg-[#141517] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400">防挖保护期 (天)</label>
              <input
                type="number"
                min={0}
                max={365}
                value={antiFarmerDuration}
                onChange={(e) => setAntiFarmerDuration(Number(e.target.value))}
                className="h-8 w-full rounded-xs border border-[#484b51] bg-[#141517] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
              />
            </div>
          </div>

          {/* 税费接收地址 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400">税费接收地址 *</label>
            <input
              type="text"
              value={feeRecipient}
              onChange={(e) => setFeeRecipient(e.target.value)}
              placeholder="0x..."
              className="h-8 w-full rounded-xs border border-[#484b51] bg-[#1a1c1e] px-2.5 text-xs text-white focus:border-[#FE810B] focus:outline-none"
            />
          </div>

          {/* 社交链接 */}
          <div className="space-y-2">
            <span className="text-xs text-neutral-400">社交链接</span>
            <div className="grid grid-cols-1 gap-2">
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="官网链接 (https://...)"
                className="h-8 w-full rounded-xs border border-[#484b51] bg-[#1a1c1e] px-2.5 text-xs text-white placeholder:text-neutral-600 focus:border-[#FE810B] focus:outline-none"
              />
              <input
                type="url"
                value={twitter}
                onChange={(e) => setTwitter(e.target.value)}
                placeholder="Twitter 链接 (https://twitter.com/...)"
                className="h-8 w-full rounded-xs border border-[#484b51] bg-[#1a1c1e] px-2.5 text-xs text-white placeholder:text-neutral-600 focus:border-[#FE810B] focus:outline-none"
              />
              <input
                type="url"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="Telegram 链接 (https://t.me/...)"
                className="h-8 w-full rounded-xs border border-[#484b51] bg-[#1a1c1e] px-2.5 text-xs text-white placeholder:text-neutral-600 focus:border-[#FE810B] focus:outline-none"
              />
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs font-medium text-red-500">{errorMsg}</p>
          )}

          <DialogFooter className="flex flex-row items-center justify-end gap-2 border-t border-[#2F3737] pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={onClose}
              className="rounded border-[#484b51] bg-[#1a1c1e] text-xs text-neutral-300 hover:bg-[#25282c]"
            >
              取消
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded border border-white/40 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white shadow-[0_2px_0_0_#963000]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>保存中…</span>
                </>
              ) : isSaved ? (
                '已保存！'
              ) : (
                '保存修改'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function IssueTokenModal({
  token,
  onClose,
  onSuccess,
}: {
  token: TokenDetail
  onClose: () => void
  onSuccess: () => void
}) {
  const navigate = useNavigate()
  const { formattedFee } = useCreationFee()
  const {
    execute: createToken,
    isLoading,
    isSigning,
    isConfirming,
    isSuccess,
    error: txError,
    txHash,
    tokenAddress,
  } = useCreateToken()

  const [copied, setCopied] = useState(false)

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExecute = async () => {
    try {
      const result = await createToken({
        name: token.name,
        symbol: token.symbol,
        meta: token.meta || token.zhIntroduction || '',
        buyTax: token.buyTax ?? 0,
        sellTax: token.sellTax ?? 0,
        feeRecipient: (token.feeRecipient as Hex) || '0x0000000000000000000000000000000000000000',
        taxDurationDays: Number(token.taxDuration) || 30,
        antiFarmerDurationDays: Number(token.antiFarmerDuration) || 0,
        salt: token.salt ? (token.salt as Hex) : undefined,
      })

      // 部署成功后，将 txHash 和 token 关联同步给后端
      try {
        if (token.id && result.txHash) {
          await parseTxHash({
            id: token.id,
            hash: result.txHash,
          })
        }
      } catch (e) {
        console.error('Failed to sync tx hash to backend', e)
      }

      onSuccess()
    } catch {
      // 错误已由 useCreateToken hook 处理
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && !isLoading && onClose()}>
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
                  {token.symbol}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-neutral-400">
                {token.meta || token.zhIntroduction || '暂无代币描述'}
              </p>
            </div>
          </div>

          {/* 确认参数明细清单 */}
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
              <span className="text-neutral-400">预估发行费用</span>
              <span className="font-bold text-[#FFA546]">
                {formattedFee ? `${formattedFee} BNB` : '0.001 BNB'}
              </span>
            </div>
          </div>

          {/* 风险提示 */}
          {!isSuccess && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
              <span>
                链上发行后合约参数将写入区块链且不可更改，请确认钱包留有足够的 BNB 支付 Gas 费。
              </span>
            </div>
          )}

          {/* 交易中状态提示 */}
          {isSigning && (
            <div className="flex items-center gap-2 rounded-lg border border-[#FE810B]/30 bg-[#FE810B]/10 p-3 text-xs text-[#FFA546]">
              <Loader2 className="size-4 animate-spin text-[#FE810B]" />
              <span>请在钱包中确认签名并支付发行费用…</span>
            </div>
          )}

          {isConfirming && (
            <div className="flex flex-col gap-1 rounded-lg border border-[#FE810B]/30 bg-[#FE810B]/10 p-3 text-xs text-[#FFA546]">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-[#FE810B]" />
                <span>交易已广播，等待区块链区块确认中…</span>
              </div>
              {txHash && (
                <a
                  href={`https://testnet.bscscan.com/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 underline text-neutral-300 hover:text-white"
                >
                  查看交易哈希: {formatAddress(txHash)}
                </a>
              )}
            </div>
          )}

          {/* 发行失败提示 */}
          {txError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              <span className="font-semibold">发行失败：</span>
              <span>{txError}</span>
            </div>
          )}

          {/* 发行成功卡片 */}
          {isSuccess && tokenAddress && (
            <div className="flex flex-col gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-xs text-green-400">
              <div className="flex items-center gap-2 font-bold text-sm text-green-300">
                <CheckCircle2 className="size-4" />
                <span>代币已成功发行到区块链！</span>
              </div>
              <div className="mt-1 flex items-center justify-between rounded bg-black/40 px-2.5 py-1.5 text-neutral-200">
                <span className="text-neutral-400">代币 CA：</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <span>{formatAddress(tokenAddress)}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(tokenAddress)}
                    className="cursor-pointer text-neutral-400 hover:text-white"
                  >
                    {copied ? (
                      <Check className="size-3.5 text-green-400" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                  <a
                    href={`https://testnet.bscscan.com/address/${tokenAddress}`}
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
          {isSuccess ? (
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
                  navigate(`/prelaunch?address=${tokenAddress}`)
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
                disabled={isLoading}
                onClick={onClose}
                className="rounded border-[#484b51] bg-[#1a1c1e] text-xs text-neutral-300 hover:bg-[#25282c]"
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isLoading}
                onClick={handleExecute}
                className="flex items-center gap-1.5 rounded border border-white/40 bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] text-xs font-bold text-white shadow-[0_2px_0_0_#963000] transition-transform active:translate-y-0.5"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>
                      {isSigning
                        ? '等待钱包确认…'
                        : isConfirming
                          ? '区块确认中…'
                          : '处理中…'}
                    </span>
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

export const Dashboard = () => {
  const { address } = useConnection()
  const navigate = useNavigate()
  const [editingToken, setEditingToken] = useState<TokenDetail | null>(null)
  const [issuingToken, setIssuingToken] = useState<TokenDetail | null>(null)

  const {
    data: tokens,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['creatorTokens', address],
    queryFn: () => getTokensByCreator(address!),
    enabled: Boolean(address),
  })

  const tokenList = Array.isArray(tokens) ? tokens : []

  const handlePresale = (token: TokenDetail) => {
    const tokenAddr = token.coinContractAddress || ''
    navigate(`/prelaunch?address=${tokenAddr}`)
  }

  const handleLaunch = (token: TokenDetail) => {
    setIssuingToken(token)
  }

  return (
    <div className="relative mx-auto flex w-full flex-col pb-24 pt-6 text-white">
      {/* 顶部标题栏 */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="返回"
            onClick={() => window.history.back()}
            className="flex size-6 shrink-0 items-center justify-center rounded-xs hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FE810B]"
          >
            <img
              src={titleBackArrow}
              alt=""
              aria-hidden="true"
              className="size-full object-cover"
            />
          </button>
          <div>
            <h1 className="text-lg font-bold tracking-wide text-white">
              控制台 / 我的代币
            </h1>
            <p className="text-xs text-neutral-400">
              管理您创建的代币，发起预售或修改相关配置
            </p>
          </div>
        </div>

        {address && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isLoading || isRefetching}
            className="cursor-pointer rounded border-[#484b51] bg-[#131516] text-xs text-neutral-300 hover:bg-white/10"
          >
            <RefreshCw
              className={`size-3.5 ${isRefetching ? 'animate-spin' : ''}`}
            />
            <span>刷新</span>
          </Button>
        )}
      </div>

      {/* 钱包未连接状态 */}
      {!address && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#484b51] bg-[#131516] p-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[#FE810B]/10 text-[#FE810B]">
            <Wallet className="size-7" />
          </div>
          <h2 className="mb-1 text-base font-bold text-white">
            请先连接您的钱包
          </h2>
          <p className="mb-6 max-w-sm text-xs text-neutral-400">
            连接钱包后即可查看并管理您所发行的所有代币资产与预售进度
          </p>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button
                type="button"
                onClick={show}
                className="cursor-pointer rounded-md border border-[#FE810B] bg-[#FD810B1A] px-6 py-2 text-sm font-semibold text-white transition-all active:translate-y-0.5 hover:bg-[#FD810B33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFA546]"
              >
                连接钱包
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      )}

      {/* 加载中状态 */}
      {address && isLoading && (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-64 animate-pulse space-y-4 rounded-lg border border-[#2F3737] bg-[#131516] p-4"
            >
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-lg bg-neutral-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 rounded bg-neutral-800" />
                  <div className="h-3 w-36 rounded bg-neutral-800" />
                </div>
              </div>
              <div className="h-12 rounded bg-neutral-800/60" />
              <div className="h-16 rounded bg-neutral-800/40" />
            </div>
          ))}
        </div>
      )}

      {/* 请求出错状态 */}
      {address && !isLoading && isError && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#484b51] bg-[#131516] p-12 text-center">
          <p className="mb-4 text-sm text-red-400">
            获取代币列表失败，请稍后重试
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            className="rounded border-[#484b51] bg-[#1a1c1e] text-xs text-white"
          >
            重新加载
          </Button>
        </div>
      )}

      {/* 空列表状态 */}
      {address && !isLoading && !isError && tokenList.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-[#484b51] bg-[#131516] p-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-neutral-800 text-neutral-400">
            <Coins className="size-7" />
          </div>
          <h2 className="mb-1 text-base font-bold text-white">
            暂无发行的代币
          </h2>
          <p className="mb-6 max-w-sm text-xs text-neutral-400">
            您还没有创建过任何代币。立即创建属于您的代币并启动预售吧！
          </p>
          <Link
            to="/launch"
            className="cursor-pointer rounded-md bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B] px-6 py-2 text-sm font-semibold text-white shadow-[0_3px_0_0_#963000] transition-all active:translate-y-0.5"
          >
            创建第一个代币
          </Link>
        </div>
      )}

      {/* 代币卡片列表 */}
      {address && !isLoading && !isError && tokenList.length > 0 && (
        <div className="flex flex-col gap-4">
          {tokenList.map((token) => (
            <TokenCard
              key={token.id || token.coinContractAddress}
              token={token}
              onEdit={(t) => setEditingToken(t)}
              onPresale={handlePresale}
              onLaunch={handleLaunch}
            />
          ))}
        </div>
      )}

      {/* 编辑代币信息弹窗 */}
      {editingToken && (
        <EditInfoModal
          token={editingToken}
          onClose={() => setEditingToken(null)}
          onSuccess={() => void refetch()}
        />
      )}

      {/* 链上发行确认弹窗 */}
      {issuingToken && (
        <IssueTokenModal
          token={issuingToken}
          onClose={() => setIssuingToken(null)}
          onSuccess={() => void refetch()}
        />
      )}
    </div>
  )
}
