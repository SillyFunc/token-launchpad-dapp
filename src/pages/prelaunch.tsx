import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useConnection } from 'wagmi'
import { format } from 'date-fns'
import { ExternalLink, Info, Loader2 } from 'lucide-react'

import { PageBackTitle } from '@/components/common/page-back-title'
import { SectionWrapper } from '@/components/prelaunch/section-wrapper'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { getExplorerUrl } from '@/config/network'
import {
  CoordinatorError,
  useReservationFee,
  useReserveTokenAddress,
  type CoordinatorErrorCode,
} from '@/hooks/use-coordinator'
import { useReservedAddresses } from '@/hooks/use-reserved-addresses'
import { useVanitySalt } from '@/lib/vanity-salt'
import { markSaltReserved } from '@/lib/reserved-salt-store'

const gradientButtonClass =
  'max-w-50 text-sm font-semibold h-10 [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] bg-linear-to-r from-[#FE810B] via-[#FFA546] to-[#FE810B]'

/** 锁定失败错误码 → 文案（未命中走兜底文案，错误码来源见对接文档第 6 章） */
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
  return err instanceof Error ? err.message : '锁定失败，请稍后重试'
}

export const Prelaunch = () => {
  const nav = useNavigate()
  const { address } = useConnection()
  const { formattedFee: reservationFee } = useReservationFee()
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
    if (!salt || !predictedAddress) return

    setIsReserving(true)
    try {
      const { hash } = await reserveTokenAddress(salt)
      markSaltReserved(salt, predictedAddress, hash)
      toast.success('地址已锁定并归属当前钱包，可随时用于发布代币', '锁定成功')
      refetch()
      // 锁定成功后清空输入框回显，回到未生成状态（盐值已存档，供后续发布代币使用）
      resetSalt()
    } catch (err) {
      toast.error(toLockErrorMessage(err), '锁定失败')
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
                className="text-xs text-white border border-[#84888c] bg-transparent h-8 px-6 [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)] shrink-0"
              >
                {isFetching ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  '重新整理'
                )}
              </Button>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {!address ? (
                <p className="py-6 text-center text-xs text-[#84888c]">
                  请先连接钱包，查询您锁定的保留 CA。
                </p>
              ) : isLoading ? (
                <p className="py-6 text-center text-xs text-[#84888c]">
                  正在从链上查询预留地址…
                </p>
              ) : reservedAddresses.length === 0 ? (
                <p className="py-6 text-center text-xs text-[#84888c]">
                  暂无预留地址，锁定成功后将展示在此处。
                </p>
              ) : (
                reservedAddresses.map((item) => (
                  <div
                    key={item.token}
                    className="flex items-center justify-between gap-3 border border-[#2f3737] bg-[#181a1d] px-3 py-2.5"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-mono text-sm text-white">
                        {item.token}
                      </span>
                      <span className="text-xs text-[#84888c]">
                        {item.reservedAt
                          ? `锁定于 ${format(new Date(item.reservedAt), 'yyyy-MM-dd HH:mm:ss')}`
                          : '已锁定'}
                      </span>
                    </div>
                    <a
                      href={getExplorerUrl(item.token)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex shrink-0 items-center gap-1 text-xs text-[#FFA546] hover:underline"
                    >
                      浏览器
                      <ExternalLink className="size-3" />
                    </a>
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
