import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useConnection, useReadContract } from 'wagmi'
import { type Abi, zeroAddress } from 'viem'

import { getTokenByContractAddress } from '@/api/token'
import { CONTRACT_ADDRESSES } from '@/contracts/addresses'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import CoordinatorFactoryAbiJson from '@/contracts/abi/CoordinatorFactory.json'
import PresaleAbiJson from '@/contracts/abi/Presale.json'
import titleBackArrow from '@/assets/icons/back-arrow.svg'

import { TokenInfoHeader } from '@/components/presale/token-info-header'
import { BlockedState } from '@/components/presale/blocked-state'
import { PresaleForm } from '@/components/presale/presale-form'

const CoordinatorFactoryAbi = CoordinatorFactoryAbiJson as unknown as Abi
const PresaleAbi = PresaleAbiJson as unknown as Abi

/** docs §4.1 presaleStatus 1-4 的中文标签 */
const PRESALE_STATUS_LABEL: Record<string, string> = {
  '1': '认购中',
  '2': '认购结束（待开盘）',
  '3': '已开盘',
  '4': '发行失败',
}

interface GateResult {
  ok: boolean
  reason?: string
  primaryAction?: { label: string; to: string }
  isLoading: boolean
}

/**
 * 前置条件校验 — 严格遵循 docs §2.2（须先 createToken）+ §2.1（已 claim 的代币
 * 托管仓无余额，无法预售）+ §4.1（仅 status=0 可 setupPresale）+ §7.9（一次性）。
 * 任一不满足返回阻塞态。
 */
function evaluateGate(input: {
  hasTokenParam: boolean
  hasAddress: boolean
  isOnTestnet: boolean
  tokenExists?: boolean
  isConfigured?: boolean
  isCreator?: boolean
  tokensClaimed?: boolean
  presaleStatus?: bigint
  isStatusError?: boolean
  isChainLoading: boolean
}): GateResult {
  const {
    hasTokenParam,
    hasAddress,
    isOnTestnet,
    tokenExists,
    isConfigured,
    isCreator,
    tokensClaimed,
    presaleStatus,
    isStatusError,
    isChainLoading,
  } = input

  if (!hasTokenParam)
    return {
      ok: false,
      reason: '未在 URL 中指定代币合约地址（?address=0x…），请从发行页面跳转进入。',
      primaryAction: { label: '前往发行代币', to: '/launch' },
      isLoading: false,
    }

  if (!hasAddress)
    return { ok: false, reason: '请先连接钱包后再配置预售条款。', isLoading: false }

  if (!isOnTestnet)
    return {
      ok: false,
      reason: '当前钱包未连接到 BSC 测试网（ChainId 97），请在钱包中切换网络。',
      isLoading: false,
    }

  // 链上查询尚未返回时不阻断，交由 BlockedState 渲染 loading 占位
  if (isChainLoading) return { ok: false, isLoading: true }

  if (tokenExists === false)
    return {
      ok: false,
      reason: '该代币不存在于本平台（coordinator 未登记），无法配置预售。',
      primaryAction: { label: '前往首页', to: '/board' },
      isLoading: false,
    }

  if (isConfigured)
    return {
      ok: false,
      reason: '预售条款已经配置，setupPresale 是一次性操作，不可重复修改。如需调整请前往控制台。',
      primaryAction: { label: '前往控制台', to: '/dashboard' },
      isLoading: false,
    }

  if (isCreator === false)
    return {
      ok: false,
      reason: '当前连接的钱包不是该代币的创建者，仅创建者可配置预售条款。',
      primaryAction: { label: '前往控制台', to: '/dashboard' },
      isLoading: false,
    }

  // docs §2.1：claimAllTokens 是出口动作，领取后托管仓无代币，预售不可行（NoSupply）
  if (tokensClaimed)
    return {
      ok: false,
      reason: '该代币已通过「一键领取」完成发放（领取即上线），托管仓已无代币，无法再开启预售。',
      primaryAction: { label: '前往控制台', to: '/dashboard' },
      isLoading: false,
    }

  if (isStatusError)
    return {
      ok: false,
      reason: '预售合约状态读取失败，请稍后重试。',
      isLoading: false,
    }

  if (presaleStatus !== undefined && presaleStatus !== 0n) {
    const text = PRESALE_STATUS_LABEL[String(presaleStatus)] ?? `status=${presaleStatus}`
    return {
      ok: false,
      reason: `当前预售状态为「${text}」，已超过可配置窗口。请前往控制台管理。`,
      primaryAction: { label: '前往控制台', to: '/dashboard' },
      isLoading: false,
    }
  }

  return { ok: true, isLoading: false }
}

export const Presale = () => {
  const [searchParams] = useSearchParams()
  const tokenAddress = (searchParams.get('address') || '') as `0x${string}`
  const hasTokenParam = tokenAddress !== ('' as `0x${string}`)
  const { address, chainId } = useConnection()
  const coordinator = CONTRACT_ADDRESSES[97].coordinatorFactory

  // 后端代币详情（用于头部展示）
  const { data: token, isLoading: isTokenLoading, isError: isTokenError } =
    useQuery({
      queryKey: ['tokenDetail', tokenAddress],
      queryFn: () => getTokenByContractAddress(tokenAddress),
      enabled: hasTokenParam,
    })

  // 链上：代币是否登记于本平台
  const { data: tokenExistsData, isLoading: isExistsLoading } = useReadContract({
    address: coordinator,
    abi: CoordinatorFactoryAbi,
    functionName: 'tokenExists',
    args: [tokenAddress],
    chainId: 97,
    query: { enabled: hasTokenParam, staleTime: 30_000 },
  })

  // 链上：是否已配置预售（一次性，docs §7.9）
  const { data: isConfiguredData, isLoading: isConfiguredLoading } =
    useReadContract({
      address: coordinator,
      abi: CoordinatorFactoryAbi,
      functionName: 'tokenConfigured',
      args: [tokenAddress],
      chainId: 97,
      query: { enabled: hasTokenParam, staleTime: 30_000 },
    })

  // 链上：当前钱包是否为创建者
  const { data: creatorAddress, isLoading: isCreatorLoading } = useReadContract({
    address: coordinator,
    abi: CoordinatorFactoryAbi,
    functionName: 'tokenCreators',
    args: [tokenAddress],
    chainId: 97,
    query: { enabled: hasTokenParam, staleTime: 30_000 },
  })

  // 链上：托管仓地址 → 一次拉齐 status + tokensClaimed（docs §4.1 / token-card 同款判定）
  const { data: presaleAddress, isLoading: isPresaleAddrLoading } =
    useReadContract({
      address: coordinator,
      abi: CoordinatorFactoryAbi,
      functionName: 'tokenPresales',
      args: [tokenAddress],
      chainId: 97,
      query: { enabled: hasTokenParam, staleTime: 30_000 },
    })
  const hasPresaleContract =
    Boolean(presaleAddress) &&
    (presaleAddress as string)?.toLowerCase() !== zeroAddress

  const {
    data: launchStatus,
    isLoading: isStatusLoading,
    isError: isStatusError,
  } = useReadContract({
    address: hasPresaleContract ? (presaleAddress as `0x${string}`) : undefined,
    abi: PresaleAbi,
    functionName: 'getLaunchStatus',
    chainId: 97,
    query: { enabled: hasPresaleContract, staleTime: 15_000 },
  })
  // [enabled, status, bnbAccumulated, tokensSubscribed, lpAdded, tokensClaimed]
  const launchStatusData = launchStatus as
    | readonly [boolean, bigint, bigint, bigint, boolean, boolean]
    | undefined
  const presaleStatus = launchStatusData?.[1]
  const tokensClaimed = Boolean(launchStatusData?.[5])

  const isChainLoading =
    isExistsLoading ||
    isConfiguredLoading ||
    isCreatorLoading ||
    isPresaleAddrLoading ||
    isStatusLoading

  const isOnTestnet = chainId === 97
  const isCreator =
    Boolean(address) &&
    Boolean(creatorAddress) &&
    creatorAddress !== zeroAddress &&
    (creatorAddress as string)?.toLowerCase() === address?.toLowerCase()

  const gate = evaluateGate({
    hasTokenParam,
    hasAddress: Boolean(address),
    isOnTestnet,
    tokenExists: Boolean(tokenExistsData),
    isConfigured: Boolean(isConfiguredData),
    isCreator,
    tokensClaimed,
    presaleStatus,
    isStatusError,
    isChainLoading,
  })

  return (
    <div className="relative mx-auto flex w-full flex-col pb-28 pt-6">
      <div className="mb-4 flex shrink-0 items-center gap-3">
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
        <span className="text-lg font-semibold tracking-wide text-white">
          配置预售条款
        </span>
      </div>

      <Card className="overflow-visible border border-[#484b51] bg-[#131516] ring-0">
        <CardHeader className="border-b border-b-[#484b51]">
          <TokenInfoHeader
            tokenAddress={tokenAddress}
            token={token}
            isLoading={isTokenLoading}
            isError={isTokenError}
          />
        </CardHeader>

        <CardContent>
          {gate.ok && address ? (
            <PresaleForm tokenAddress={tokenAddress} address={address} />
          ) : (
            <BlockedState
              reason={gate.reason ?? ''}
              isLoading={gate.isLoading}
              primaryAction={gate.primaryAction}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
