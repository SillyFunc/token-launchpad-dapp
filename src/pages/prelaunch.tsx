import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useBalance, useConfig, useConnection } from 'wagmi'
import { formatEther } from 'viem'
import {
  Check,
  Copy,
  ExternalLink,
  Info,
  Loader2,
  RefreshCcw,
} from 'lucide-react'

import { PageBackTitle } from '@/components/common/page-back-title'
import { SectionWrapper } from '@/components/prelaunch/section-wrapper'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { saveTokenSalt } from '@/api/token'
import { requestAuthSignature, type AuthSignature } from '@/api/auth'
import { DEFAULT_CHAIN_ID, getExplorerUrl } from '@/config/network'
import { parseContractError } from '@/lib/contract-error'
import { ApiError } from '@/lib/request'
import {
  CoordinatorError,
  useReservationFee,
  useReserveTokenAddress,
  type CoordinatorErrorCode,
} from '@/hooks/use-coordinator'
import { useReservedAddresses } from '@/hooks/use-reserved-addresses'
import { useVanitySalt } from '@/lib/vanity-salt'

const gradientButtonClass =
  'max-w-50 text-sm font-semibold h-10 [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B]'

// 与 useReserveTokenAddress 的兜底值保持一致；费用读取暂未完成时也能先做余额拦截。
const FALLBACK_RESERVATION_FEE_WEI = 10_000_000_000_000_000n

const RESERVED_ADDRESS_STATUS = {
  0: { label: '未使用', className: 'text-[#7adfa1]' },
  1: { label: '已占用', className: 'text-[#FFA546]' },
  2: { label: '已使用', className: 'text-[#84888c]' },
} as const

const LOCK_ERROR_MESSAGES: Partial<Record<CoordinatorErrorCode, string>> = {
  USER_REJECTED: '用户已取消交易',
  INSUFFICIENT_FUNDS: '钱包 tBNB 余额不足，无法支付预留费',
  WRONG_NETWORK: '请在钱包中切换网络至 BSC 测试网 (BNB Smart Chain Testnet)',
  INSUFFICIENT_RESERVATION_FEE: '预留费不足',
  ADDRESS_ALREADY_RESERVED: '该地址已被他人锁定，请重新生成',
  ADDRESS_ALREADY_DEPLOYED: '该地址已被占用，请重新生成',
  INVALID_SALT: '盐值非法，请重新生成',
  INVALID_VANITY_SUFFIX: '地址尾号校验失败，请重新生成',
  FACTORY_DISABLED: '平台维护中，暂不可锁定地址',
}

function toLockErrorMessage(err: unknown): string {
  if (err instanceof CoordinatorError) {
    return LOCK_ERROR_MESSAGES[err.code] ?? '锁定失败，请稍后重试'
  }
  if (err instanceof ApiError) {
    return err.message || '预留记录保存失败，请稍后重试'
  }
  if (err instanceof Error)
    return parseContractError(err, '锁定失败，请稍后重试')
  return '锁定失败，请稍后重试'
}

export const Prelaunch = () => {
  const nav = useNavigate()
  const config = useConfig()
  const { address, chainId } = useConnection()
  const { fee: reservationFeeWei, formattedFee: reservationFee } =
    useReservationFee()
  const { data: balanceData } = useBalance({
    address,
    chainId: DEFAULT_CHAIN_ID,
    query: {
      enabled: Boolean(address),
      staleTime: 10_000,
    },
  })
  const { execute: reserveTokenAddress } = useReserveTokenAddress()
  const {
    salt,
    predictedAddress,
    isSearching,
    error: searchError,
    regenerate,
    reset: resetSalt,
  } = useVanitySalt({ autoSearch: false })
  const {
    addresses: reservedAddresses,
    isLoading,
    isFetching,
    refetch,
  } = useReservedAddresses()
  const [isReserving, setIsReserving] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  const handleCopy = (value: string) => {
    void navigator.clipboard.writeText(value)
    setCopiedAddress(value)
    toast.success('已复制到剪贴板')
    setTimeout(() => setCopiedAddress(null), 2000)
  }

  const handleBack = () => {
    nav('/launch')
  }

  const handleGenerate = () => {
    regenerate()
  }

  useEffect(() => {
    if (searchError) toast.error(searchError, '生成失败')
  }, [searchError])

  const canLock = Boolean(salt && predictedAddress && address) && !isReserving

  const handleLock = async () => {
    if (!salt || !predictedAddress || !address) return

    if (chainId !== DEFAULT_CHAIN_ID) {
      toast.error('请先在钱包中切换到当前平台网络', '网络不匹配')
      return
    }

    const requiredFeeWei = reservationFeeWei ?? FALLBACK_RESERVATION_FEE_WEI
    if (!balanceData) {
      toast.error('正在读取钱包余额，请稍后再试', '余额读取中')
      return
    }
    if (balanceData.value < requiredFeeWei) {
      toast.error(
        `钱包余额不足，预留费需要至少 ${formatEther(requiredFeeWei)} BNB（当前余额 ${formatEther(balanceData.value)} BNB）`,
        '余额不足',
      )
      return
    }

    setIsReserving(true)
    try {
      let auth: AuthSignature
      let txHash: string

      try {
        auth = await requestAuthSignature(config, address)
      } catch (err) {
        console.error('[Prelaunch] 获取预留鉴权签名失败', {
          contractAddress: predictedAddress,
          error: err,
        })
        toast.error(toLockErrorMessage(err), '签名失败')
        return
      }

      try {
        const result = await reserveTokenAddress(salt)
        txHash = result.hash
      } catch (err) {
        console.error('[Prelaunch] 链上锁定交易失败', {
          contractAddress: predictedAddress,
          error: err,
        })
        toast.error(toLockErrorMessage(err), '锁定失败')
        return
      }

      try {
        await saveTokenSalt({
          contractAddress: predictedAddress,
          salt,
          txHash,
          address: auth.address,
          message: auth.message,
          signature: auth.signature,
        })
      } catch (err) {
        console.error('[Prelaunch] 保存预留记录失败（链上锁定已成功）', {
          contractAddress: predictedAddress,
          txHash,
          error: err,
        })
        return
      }

      toast.success('地址已锁定并归属当前钱包，可随时用于发布代币', '锁定成功')
      resetSalt()
      const refreshed = await refetch()
      if (refreshed.error) {
        console.warn('[Prelaunch] 预留记录已保存，但列表刷新失败', {
          error: refreshed.error,
          contractAddress: predictedAddress,
        })
      }
    } finally {
      setIsReserving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <PageBackTitle title="保留您的代币 CA" onBack={handleBack} />
      <Card className="bg-[#131516] border border-[#484b51] px-4 py-4! space-y-6!">
        <SectionWrapper title="生成 CA" prefix={1}>
          <p className="text-sm text-[#a0a3a7]">
            我们将为您生成代币 CA, 只需几秒钟。
          </p>
          <Button
            onClick={handleGenerate}
            disabled={isSearching}
            className={gradientButtonClass}
          >
            {isSearching ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                生成中…
              </>
            ) : (
              '生成 CA'
            )}
          </Button>
        </SectionWrapper>
        <SectionWrapper title="锁定 CA 地址" prefix={2}>
          <div className="text-[#f68f15] border-none bg-[rgba(246,143,21,0.1)] flex items-start items-center gap-2 p-3">
            <Info className="text-[#f68f15] size-4" />
            <p className="text-[#f68f15] text-xs">
              预留费不予退还；锁定后地址永久归属当前钱包，他人无法占用，也不会过期。
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>保留 CA</Label>
            <Input
              disabled
              value={predictedAddress ?? ''}
              placeholder="请先点击「生成 CA」"
              className="border border-[#84888c] h-10.5 bg-[#18191b]! text-white text-sm"
            />
          </div>
          <Button
            onClick={handleLock}
            disabled={!canLock}
            className={gradientButtonClass}
          >
            {isReserving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                锁定中…
              </>
            ) : (
              `锁定地址 (${reservationFee ?? '0.01'} BNB)`
            )}
          </Button>
        </SectionWrapper>
        <SectionWrapper title="发布您的代币" prefix={3}>
          <div className="border border-[#484b51] p-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-y-2">
                <span className="text-sm text-white">可用的保留 CA</span>
                <span className="text-[#84888c] text-xs">
                  展示连接钱包下的预留地址。
                </span>
              </div>
              <Button
                onClick={() => refetch()}
                disabled={isFetching || !address}
                className="border border-[#84888c] bg-transparent h-8 px-4 shrink-0 flex items-center hover:bg-transparent! hover:border-white hover:cursor-pointer"
              >
                {isFetching ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <>
                    <RefreshCcw className="size-3.5" />
                    <span className="text-xs text-white leading-none">
                      重新整理
                    </span>
                  </>
                )}
              </Button>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {!address ? (
                <p className="py-6 text-center text-xs text-[#84888c]">
                  请先连接钱包，查询您锁定的保留 CA。
                </p>
              ) : isLoading ? (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Spinner className="size-4 text-[#84888c]" />
                  <span className="text-xs text-[#84888c]">加载中…</span>
                </div>
              ) : reservedAddresses.length === 0 ? (
                <p className="py-6 text-center text-xs text-[#84888c]">
                  暂无预留地址，锁定成功后将展示在此处。
                </p>
              ) : (
                reservedAddresses.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border border-[#2f3737] bg-[#181a1d] px-3 py-2.5"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="break-all font-mono text-sm leading-5 text-white">
                        {item.contractAddress}
                      </span>
                      <span
                        className={`text-xs ${RESERVED_ADDRESS_STATUS[item.coinStatus].className}`}
                      >
                        {RESERVED_ADDRESS_STATUS[item.coinStatus].label}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="复制地址"
                        onClick={() => handleCopy(item.contractAddress)}
                        className="text-[#84888c] hover:text-white"
                      >
                        {copiedAddress === item.contractAddress ? (
                          <Check className="size-3.5 text-[#7adfa1]" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                      <a
                        href={getExplorerUrl(item.contractAddress)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="在浏览器中查看"
                        className="inline-flex size-7 items-center justify-center text-[#84888c] transition-colors hover:text-[#FFA546]"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </SectionWrapper>
      </Card>
    </div>
  )
}
