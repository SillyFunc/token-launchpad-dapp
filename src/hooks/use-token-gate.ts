import { useConnection, useReadContracts, useWatchContractEvent } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { isAddress, zeroAddress, parseEther, type Hex } from 'viem'

import type { TokenDetail } from '@/api/token'
import { CoordinatorFactoryAbi, PresaleAbi } from '@/contracts/abi'
import {
  DEFAULT_CHAIN_ID,
  getContractAddresses,
} from '@/config/network'

/** docs §4.1 presaleStatus 0-4 状态展示名 */
export const PRESALE_STATUS_LABEL: Record<number, string> = {
  0: '创建/未开启',
  1: '认购中',
  2: '认购结束（待开盘）',
  3: '已开盘',
  4: '发行失败',
}

/**
 * 代币卡片的完整生命周期阶段（在 useTokenGate 链上态之上聚合而成）。
 * 顺序即优先级：草稿 → 同步中 → 二选一出口 → 预售各阶段 → 终态。
 */
export type TokenCardStage =
  | 'draft' // 未发行草稿
  | 'syncing' // 链上状态同步中
  | 'claim_or_setup' // 已发行未配置：领取 / 设置预售
  | 'open_presale' // 已配置待开启（status 0）
  | 'presale_live' // 认购中（status 1，未达软顶）
  | 'end_presale' // 认购中且已达软顶（status 1）
  | 'launch' // 认购结束待开盘（status 2）
  | 'failed' // 发行失败（status 4）
  | 'terminal' // 已开盘（status 3）或已领取

export function resolveTokenStage(g: {
  isIssued: boolean
  isChainLoading: boolean
  tokensClaimed: boolean
  presaleConfigured: boolean
  presaleStatus?: number
  isSoftCapReached: boolean
}): TokenCardStage {
  if (!g.isIssued) return 'draft'
  if (g.isChainLoading) return 'syncing'
  if (!g.tokensClaimed && !g.presaleConfigured) return 'claim_or_setup'
  if (
    !g.tokensClaimed &&
    g.presaleConfigured &&
    (g.presaleStatus === 0 || g.presaleStatus === undefined)
  ) {
    return 'open_presale'
  }
  if (!g.tokensClaimed && g.presaleStatus === 1) {
    return g.isSoftCapReached ? 'end_presale' : 'presale_live'
  }
  if (!g.tokensClaimed && g.presaleStatus === 2) return 'launch'
  if (!g.tokensClaimed && g.presaleStatus === 4) return 'failed'
  return 'terminal'
}

export interface GateAction {
  allowed: boolean
  reason?: string
  primaryAction?: { label: string; to: string }
  isLoading?: boolean
}

export interface UseTokenGateOptions {
  /** 代币合约地址（已发币时代币地址） */
  tokenAddress?: string | Hex
  /** 代币详情对象（可选，草稿或详情） */
  token?: TokenDetail | null
  /** 显式指定的创建者地址（可选） */
  creatorAddress?: string
  /** 是否开启链上事件实时监听（默认 false，建议仅在详情页开启，避免列表卡片开启过多监听） */
  watch?: boolean
}

export interface TokenGateResult {
  // 基础连接与网络
  hasWallet: boolean
  isOnTestnet: boolean
  userAddress?: Hex

  // 身份与代币基础判定
  isIssued: boolean
  isCreator: boolean
  tokenAddress?: Hex

  // 链上状态
  isChainLoading: boolean
  isChainError: boolean
  tokenExists: boolean
  presaleConfigured: boolean
  presaleAddress?: Hex
  presaleStatus?: number
  tokensClaimed: boolean
  presaleEnabled: boolean
  presaleOwner?: Hex

  // 预售进度与软顶判定
  bnbAccumulated: bigint
  tokensSubscribed: bigint
  presaleShare: bigint
  softCap: bigint
  hardCap: bigint
  isSoftCapReached: boolean
  isSoldOut: boolean

  // 动作权限守卫
  canEdit: GateAction
  canIssue: GateAction
  canSetupPresale: GateAction
  canClaimAll: GateAction
  canOpenPresale: GateAction
  canEndPresale: GateAction
  canLaunch: GateAction
}

/**
 * 通用代币门禁与权限 Hook
 */
export function useTokenGate(options?: UseTokenGateOptions): TokenGateResult {
  const queryClient = useQueryClient()
  const { address: userAddress, chainId } = useConnection()
  const coordinator = getContractAddresses(DEFAULT_CHAIN_ID).coordinatorFactory

  // 解析并规范化代币合约地址（仅取 coinContractAddress 或显式传入的 tokenAddress，绝不可取创建者钱包 address）
  const rawAddress =
    options?.tokenAddress ||
    options?.token?.coinContractAddress ||
    ''
  const validTokenAddress =
    Boolean(rawAddress) &&
    isAddress(String(rawAddress)) &&
    String(rawAddress).toLowerCase() !== zeroAddress
      ? (String(rawAddress).toLowerCase() as Hex)
      : undefined
  const hasValidTokenAddress = Boolean(validTokenAddress)

  const hasWallet = Boolean(userAddress)
  const isOnTestnet = chainId === DEFAULT_CHAIN_ID

  // 安全占位地址（防止 wagmi 在 enabled: false 时因参数不匹配而报错）
  const queryTokenAddress = validTokenAddress ?? zeroAddress

  // ================= 链上状态读取（Multicall 批量打包，从 10 次 RPC 骤降至 2 次） =================

  // 1. Coordinator 批量读取: tokenExists, tokenConfigured, tokenCreators, tokenPresales
  const {
    data: coordinatorBatch,
    isLoading: isCoordinatorLoading,
    isError: isCoordinatorError,
  } = useReadContracts({
    contracts: [
      {
        address: coordinator,
        abi: CoordinatorFactoryAbi,
        functionName: 'tokenExists',
        args: [queryTokenAddress],
        chainId: DEFAULT_CHAIN_ID,
      },
      {
        address: coordinator,
        abi: CoordinatorFactoryAbi,
        functionName: 'tokenConfigured',
        args: [queryTokenAddress],
        chainId: DEFAULT_CHAIN_ID,
      },
      {
        address: coordinator,
        abi: CoordinatorFactoryAbi,
        functionName: 'tokenCreators',
        args: [queryTokenAddress],
        chainId: DEFAULT_CHAIN_ID,
      },
      {
        address: coordinator,
        abi: CoordinatorFactoryAbi,
        functionName: 'tokenPresales',
        args: [queryTokenAddress],
        chainId: DEFAULT_CHAIN_ID,
      },
    ],
    query: { enabled: hasValidTokenAddress, staleTime: 30_000 },
  })

  const tokenExistsData = coordinatorBatch?.[0]?.result as boolean | undefined
  const isConfiguredData = coordinatorBatch?.[1]?.result as boolean | undefined
  const onchainCreatorData = coordinatorBatch?.[2]?.result as string | undefined
  const presaleAddressData = coordinatorBatch?.[3]?.result as string | undefined

  const rawPresaleAddr =
    options?.token?.presaleAddress ||
    (presaleAddressData as string | undefined) ||
    ''

  const presaleAddress =
    Boolean(rawPresaleAddr) &&
    isAddress(String(rawPresaleAddr)) &&
    String(rawPresaleAddr).toLowerCase() !== zeroAddress
      ? (String(rawPresaleAddr).toLowerCase() as Hex)
      : undefined

  const queryPresaleAddress = presaleAddress ?? zeroAddress
  const hasPresaleContract = Boolean(
    presaleAddress && presaleAddress !== zeroAddress,
  )

  // 2. Presale 托管仓批量读取: getLaunchStatus, owner, softCap, hardcap, presaleShare
  const {
    data: presaleBatch,
    isLoading: isPresaleLoading,
    isError: isPresaleError,
    refetch: refetchPresaleBatch,
  } = useReadContracts({
    contracts: [
      {
        address: queryPresaleAddress,
        abi: PresaleAbi,
        functionName: 'getLaunchStatus',
        chainId: DEFAULT_CHAIN_ID,
      },
      {
        address: queryPresaleAddress,
        abi: PresaleAbi,
        functionName: 'owner',
        chainId: DEFAULT_CHAIN_ID,
      },
      {
        address: queryPresaleAddress,
        abi: PresaleAbi,
        functionName: 'softCap',
        chainId: DEFAULT_CHAIN_ID,
      },
      {
        address: queryPresaleAddress,
        abi: PresaleAbi,
        functionName: 'hardcap',
        chainId: DEFAULT_CHAIN_ID,
      },
      {
        address: queryPresaleAddress,
        abi: PresaleAbi,
        functionName: 'presaleShare',
        chainId: DEFAULT_CHAIN_ID,
      },
    ],
    query: {
      enabled: hasPresaleContract,
      staleTime: 30_000,
    },
  })

  const launchStatusData = presaleBatch?.[0]?.result
  const presaleOwnerData = presaleBatch?.[1]?.result as string | undefined
  const softCapData = presaleBatch?.[2]?.result as bigint | undefined
  const hardCapData = presaleBatch?.[3]?.result as bigint | undefined
  const presaleShareData = presaleBatch?.[4]?.result as bigint | undefined

  // ================= 链上事件实时监听（即时刷新 UI，仅在显式开启 watch 时生效） =================

  useWatchContractEvent({
    address: presaleAddress,
    abi: PresaleAbi,
    chainId: DEFAULT_CHAIN_ID,
    enabled: Boolean(options?.watch) && hasPresaleContract,
    onLogs: () => {
      void queryClient.invalidateQueries({
        queryKey: ['readContracts'],
      })
      void refetchPresaleBatch()
    },
  })

  // ================= 状态解析与聚合 =================

  const tokenExists = Boolean(tokenExistsData)
  // 是否已在链上真正发行：必须有有效合约地址，且 tokenExists 为 true
  const isIssued = Boolean(
    hasValidTokenAddress && (tokenExistsData !== undefined ? tokenExists : true),
  )

  const isChainLoading = hasValidTokenAddress
    ? isCoordinatorLoading || (hasPresaleContract && isPresaleLoading)
    : false

  const isChainError = hasValidTokenAddress
    ? isCoordinatorError || (hasPresaleContract && isPresaleError)
    : false
  const presaleConfigured = Boolean(isConfiguredData)

  // 兼容器件返回值：支持命名对象属性和数字数组索引两种解构
  const rawStatus =
    (launchStatusData as any)?.status !== undefined
      ? (launchStatusData as any).status
      : Array.isArray(launchStatusData)
        ? launchStatusData[1]
        : undefined

  const presaleStatus =
    rawStatus !== undefined ? Number(rawStatus) : undefined

  const rawBnb =
    (launchStatusData as any)?.bnbAccumulated !== undefined
      ? (launchStatusData as any).bnbAccumulated
      : Array.isArray(launchStatusData)
        ? launchStatusData[2]
        : 0n
  const bnbAccumulated = (rawBnb as bigint) ?? 0n

  const rawSubscribed =
    (launchStatusData as any)?.tokensSubscribed !== undefined
      ? (launchStatusData as any).tokensSubscribed
      : Array.isArray(launchStatusData)
        ? launchStatusData[3]
        : 0n
  const tokensSubscribed = (rawSubscribed as bigint) ?? 0n

  const rawClaimed =
    (launchStatusData as any)?.tokensClaimed_ !== undefined
      ? (launchStatusData as any).tokensClaimed_
      : (launchStatusData as any)?.tokensClaimed !== undefined
        ? (launchStatusData as any).tokensClaimed
        : Array.isArray(launchStatusData)
          ? launchStatusData[5]
          : false
  const tokensClaimed = Boolean(rawClaimed)

  const presaleEnabled =
    (launchStatusData as any)?.enabled !== undefined
      ? Boolean((launchStatusData as any).enabled)
      : Array.isArray(launchStatusData)
        ? Boolean(launchStatusData[0])
        : presaleStatus !== undefined && presaleStatus >= 1

  const rawSoftCap = (softCapData as bigint | undefined) ?? 0n
  const softCap =
    rawSoftCap > 0n
      ? rawSoftCap
      : parseEther(
          String(
            options?.token?.softcap ||
              options?.token?.soft ||
              options?.token?.minLiquidityAmount ||
              '0',
          ),
        )

  const rawHardCap = (hardCapData as bigint | undefined) ?? 0n
  const hardCap =
    rawHardCap > 0n
      ? rawHardCap
      : parseEther(String(options?.token?.hardcap || '0'))

  const presaleShare = (presaleShareData as bigint | undefined) ?? 0n

  const isSoftCapReached = softCap > 0n && bnbAccumulated >= softCap
  const isSoldOut = presaleShare > 0n && tokensSubscribed >= presaleShare

  const presaleOwner =
    presaleOwnerData && String(presaleOwnerData).toLowerCase() !== zeroAddress
      ? (String(presaleOwnerData).toLowerCase() as Hex)
      : undefined

  // 创建者身份校验
  const expectedCreator =
    (onchainCreatorData as string | undefined) ||
    presaleOwner ||
    options?.token?.creatorAddress ||
    options?.creatorAddress

  const isCreator = Boolean(
    hasWallet &&
      userAddress &&
      expectedCreator &&
      expectedCreator.toLowerCase() !== zeroAddress &&
      expectedCreator.toLowerCase() === userAddress.toLowerCase(),
  )

  // ================= 动作权限评估 =================

  // 1. 编辑代币资料 (canEdit): 必须是创建者 + 必须是未发行草稿态
  const canEdit: GateAction = (() => {
    if (!hasWallet) {
      return { allowed: false, reason: '请先连接钱包' }
    }
    if (options?.token && !isCreator) {
      return { allowed: false, reason: '仅代币创建者可编辑代币资料' }
    }
    if (isIssued) {
      return {
        allowed: false,
        reason:
          '代币已在链上部署发行，合约核心参数已固化，无法再编辑资料。',
      }
    }
    return { allowed: true }
  })()

  // 2. 发行代币上链 (canIssue): 必须未发行 + 是创建者
  const canIssue: GateAction = (() => {
    if (!hasWallet) {
      return { allowed: false, reason: '请先连接钱包' }
    }
    if (options?.token && !isCreator) {
      return { allowed: false, reason: '仅代币创建者可执行发行' }
    }
    if (isIssued) {
      return { allowed: false, reason: '该代币已在链上部署发行' }
    }
    return { allowed: true }
  })()

  // 3. 配置预售条款 (canSetupPresale): 已发行 + 未领取 + 未配置 + status=0 + 是创建者
  const canSetupPresale: GateAction = (() => {
    if (!validTokenAddress) {
      return {
        allowed: false,
        reason:
          '该代币尚未在区块链上发行，无法配置预售。请先在控制台点击「我要发行」完成代币上链。',
        primaryAction: { label: '前往控制台', to: '/dashboard' },
        isLoading: false,
      }
    }
    if (!hasWallet) {
      return {
        allowed: false,
        reason: '请先连接钱包后再配置预售条款。',
        isLoading: false,
      }
    }
    if (isChainLoading) {
      return { allowed: false, isLoading: true }
    }
    if (tokenExists === false) {
      return {
        allowed: false,
        reason:
          '该代币不存在于本平台（coordinator 未登记），无法配置预售。',
        primaryAction: { label: '前往首页', to: '/board' },
        isLoading: false,
      }
    }
    if (presaleConfigured) {
      return {
        allowed: false,
        reason:
          '预售条款已经配置，setupPresale 是一次性操作，不可重复修改。如需调整请前往控制台。',
        primaryAction: { label: '前往控制台', to: '/dashboard' },
        isLoading: false,
      }
    }
    if (!isCreator) {
      return {
        allowed: false,
        reason:
          '当前连接的钱包不是该代币的创建者，仅创建者可配置预售条款。',
        primaryAction: { label: '前往控制台', to: '/dashboard' },
        isLoading: false,
      }
    }
    if (tokensClaimed) {
      return {
        allowed: false,
        reason:
          '该代币已通过「一键领取」完成发放（领取即上线），托管仓已无代币，无法再开启预售。',
        primaryAction: { label: '前往控制台', to: '/dashboard' },
        isLoading: false,
      }
    }
    if (isPresaleError) {
      return {
        allowed: false,
        reason: '预售合约状态读取失败，请稍后重试。',
        isLoading: false,
      }
    }
    if (presaleStatus !== undefined && presaleStatus !== 0) {
      const text =
        PRESALE_STATUS_LABEL[presaleStatus] ?? `status=${presaleStatus}`
      return {
        allowed: false,
        reason: `当前预售状态为「${text}」，已超过可配置窗口。请前往控制台管理。`,
        primaryAction: { label: '前往控制台', to: '/dashboard' },
        isLoading: false,
      }
    }
    return { allowed: true, isLoading: false }
  })()

  // 4. 一键领取 (canClaimAll): 已发行 + 未开启预售 + 未领取 + 是所有者
  const canClaimAll: GateAction = (() => {
    if (!hasWallet) {
      return { allowed: false, reason: '请先连接钱包' }
    }
    if (!isIssued) {
      return { allowed: false, reason: '代币尚未在链上发行' }
    }
    if (!presaleAddress) {
      return { allowed: false, reason: '未找到代币托管仓合约' }
    }
    if (!isCreator) {
      return { allowed: false, reason: '仅代币所有者可一键领取代币' }
    }
    if (presaleEnabled) {
      return { allowed: false, reason: '预售已开启，无法一键领取代币' }
    }
    if (tokensClaimed) {
      return { allowed: false, reason: '代币已领取，不可重复领取' }
    }
    return { allowed: true }
  })()

  // 5. 开启预售 (canOpenPresale): 已配置 + 是创建者 + status=0
  const canOpenPresale: GateAction = (() => {
    if (!hasWallet || !isCreator || !presaleConfigured) {
      return { allowed: false }
    }
    return { allowed: presaleStatus === 0 }
  })()

  // 6. 结束预售 (canEndPresale): 状态处于 1 (认购中) + 必须达到软顶 + 是创建者
  const canEndPresale: GateAction = (() => {
    if (!hasWallet || !isCreator || !hasPresaleContract) {
      return { allowed: false }
    }
    if (presaleStatus !== 1) {
      return { allowed: false, reason: '当前预售状态非认购中，不可结束预售' }
    }
    if (!isSoftCapReached) {
      return {
        allowed: false,
        reason: '募集资金尚未达到预售软顶，暂不可结束预售',
      }
    }
    return { allowed: true }
  })()

  // 7. 一键开盘加池 (canLaunch): 状态处于 2 (认购结束) + 是创建者
  const canLaunch: GateAction = (() => {
    if (!hasWallet || !isCreator || !hasPresaleContract) {
      return { allowed: false }
    }
    return { allowed: presaleStatus === 2 }
  })()

  return {
    hasWallet,
    isOnTestnet,
    userAddress,
    isIssued,
    isCreator,
    tokenAddress: validTokenAddress,
    isChainLoading,
    isChainError,
    tokenExists,
    presaleConfigured,
    presaleAddress,
    presaleStatus,
    tokensClaimed,
    presaleEnabled,
    presaleOwner,
    bnbAccumulated,
    tokensSubscribed,
    presaleShare,
    softCap,
    hardCap,
    isSoftCapReached,
    isSoldOut,
    canEdit,
    canIssue,
    canSetupPresale,
    canClaimAll,
    canOpenPresale,
    canEndPresale,
    canLaunch,
  }
}
