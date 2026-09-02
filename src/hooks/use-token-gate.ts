import { useConnection, useReadContract } from 'wagmi'
import { isAddress, zeroAddress, type Abi, type Hex } from 'viem'

import type { TokenDetail } from '@/api/token'
import {
  DEFAULT_CHAIN_ID,
  getContractAddresses,
  getTargetChainName,
} from '@/config/network'
import CoordinatorFactoryAbiJson from '@/contracts/abi/CoordinatorFactory.json'
import PresaleAbiJson from '@/contracts/abi/Presale.json'

const CoordinatorFactoryAbi = CoordinatorFactoryAbiJson as unknown as Abi
const PresaleAbi = PresaleAbiJson as unknown as Abi

/** docs §4.1 presaleStatus 1-4 状态展示名 */
export const PRESALE_STATUS_LABEL: Record<number, string> = {
  0: '创建/未开启',
  1: '认购中',
  2: '认购结束（待开盘）',
  3: '已开盘',
  4: '发行失败',
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

  // 动作权限守卫
  canEdit: GateAction
  canIssue: GateAction
  canSetupPresale: GateAction
  canClaimAll: GateAction
  canOpenPresale: GateAction
}

/**
 * 通用代币门禁与权限 Hook
 *
 * 统一收敛：
 * 1. 通用基础门禁（钱包连接、BSC 测试网 97、创建者身份校验）
 * 2. 未发行阶段门禁（草稿编辑 canEdit、发行上链 canIssue）
 * 3. 已发行预售阶段门禁（预售配置 canSetupPresale、一键领取 canClaimAll 等）
 */
export function useTokenGate(options?: UseTokenGateOptions): TokenGateResult {
  const { address: userAddress, chainId } = useConnection()
  const coordinator = getContractAddresses(DEFAULT_CHAIN_ID).coordinatorFactory

  // 解析并规范化代币合约地址
  const rawAddress =
    options?.tokenAddress || options?.token?.coinContractAddress || ''
  const validTokenAddress =
    Boolean(rawAddress) && isAddress(String(rawAddress))
      ? (String(rawAddress).toLowerCase() as Hex)
      : undefined
  const isIssued = Boolean(validTokenAddress)

  const hasWallet = Boolean(userAddress)
  const isOnTestnet = chainId === DEFAULT_CHAIN_ID
  const targetChainName = getTargetChainName(DEFAULT_CHAIN_ID)

  // 安全占位地址（防止 wagmi 在 enabled: false 时因参数不匹配而报错）
  const queryTokenAddress = validTokenAddress ?? zeroAddress

  // ================= 链上状态读取（仅当已发行有效地址时发起） =================

  // 1. 代币是否在平台登记
  const {
    data: tokenExistsData,
    isLoading: isExistsLoading,
    isError: isExistsError,
  } = useReadContract({
    address: coordinator,
    abi: CoordinatorFactoryAbi,
    functionName: 'tokenExists',
    args: [queryTokenAddress],
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: isIssued, staleTime: 30_000 },
  })

  // 2. 预售是否已经配置过（一次性，不可重复修改）
  const {
    data: isConfiguredData,
    isLoading: isConfiguredLoading,
    isError: isConfiguredError,
  } = useReadContract({
    address: coordinator,
    abi: CoordinatorFactoryAbi,
    functionName: 'tokenConfigured',
    args: [queryTokenAddress],
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: isIssued, staleTime: 30_000 },
  })

  // 3. 链上创建者地址
  const {
    data: onchainCreatorData,
    isLoading: isCreatorLoading,
    isError: isCreatorError,
  } = useReadContract({
    address: coordinator,
    abi: CoordinatorFactoryAbi,
    functionName: 'tokenCreators',
    args: [queryTokenAddress],
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: isIssued, staleTime: 30_000 },
  })

  // 4. 代币对应的托管仓地址
  const {
    data: presaleAddressData,
    isLoading: isPresaleAddrLoading,
    isError: isPresaleAddrError,
  } = useReadContract({
    address: coordinator,
    abi: CoordinatorFactoryAbi,
    functionName: 'tokenPresales',
    args: [queryTokenAddress],
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: isIssued, staleTime: 30_000 },
  })

  const presaleAddress =
    Boolean(presaleAddressData) &&
    String(presaleAddressData).toLowerCase() !== zeroAddress
      ? (String(presaleAddressData).toLowerCase() as Hex)
      : undefined

  const queryPresaleAddress = presaleAddress ?? zeroAddress
  const hasPresaleContract = Boolean(
    presaleAddress && presaleAddress !== zeroAddress,
  )

  // 5. 托管仓整体发射状态
  const {
    data: launchStatusData,
    isLoading: isStatusLoading,
    isError: isStatusError,
  } = useReadContract({
    address: queryPresaleAddress,
    abi: PresaleAbi,
    functionName: 'getLaunchStatus',
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: hasPresaleContract, staleTime: 15_000 },
  })

  // 6. 托管仓所有者
  const {
    data: presaleOwnerData,
    isLoading: isOwnerLoading,
    isError: isOwnerError,
  } = useReadContract({
    address: queryPresaleAddress,
    abi: PresaleAbi,
    functionName: 'owner',
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: hasPresaleContract, staleTime: 30_000 },
  })

  // ================= 状态解析与聚合 =================

  const isChainLoading = isIssued
    ? isExistsLoading ||
      isConfiguredLoading ||
      isCreatorLoading ||
      isPresaleAddrLoading ||
      (hasPresaleContract && (isStatusLoading || isOwnerLoading))
    : false

  const isChainError = isIssued
    ? isExistsError ||
      isConfiguredError ||
      isCreatorError ||
      isPresaleAddrError ||
      (hasPresaleContract && (isStatusError || isOwnerError))
    : false

  const tokenExists = Boolean(tokenExistsData)
  const presaleConfigured = Boolean(isConfiguredData)

  const launchStatus = launchStatusData as
    | readonly [boolean, bigint, bigint, bigint, boolean, boolean]
    | undefined
  const presaleEnabled = Boolean(launchStatus?.[0])
  const presaleStatus =
    launchStatus?.[1] !== undefined ? Number(launchStatus[1]) : undefined
  const tokensClaimed = Boolean(launchStatus?.[5])

  const presaleOwner =
    presaleOwnerData && String(presaleOwnerData).toLowerCase() !== zeroAddress
      ? (String(presaleOwnerData).toLowerCase() as Hex)
      : undefined

  // 创建者身份校验（多源兼容：链上 tokenCreators、presaleOwner、传入 token.creatorAddress、options.creatorAddress）
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

  // 2. 发行代币上链 (canIssue): 必须未发行 + BSC 测试网 + 是创建者
  const canIssue: GateAction = (() => {
    if (!hasWallet) {
      return { allowed: false, reason: '请先连接钱包' }
    }
    if (!isOnTestnet) {
      return {
        allowed: false,
        reason: `当前钱包未连接到 ${targetChainName}，请在钱包中切换网络。`,
      }
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
          '未在 URL 中指定有效的代币合约地址（?address=0x…），请从发行页面跳转进入。',
        primaryAction: { label: '前往发行代币', to: '/launch' },
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
    if (!isOnTestnet) {
      return {
        allowed: false,
        reason: `当前钱包未连接到 ${targetChainName}，请在钱包中切换网络。`,
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
    if (isStatusError) {
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
    if (!isOnTestnet) {
      return { allowed: false, reason: `请切换至 ${targetChainName}` }
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
    if (!hasWallet || !isOnTestnet || !isCreator || !presaleConfigured) {
      return { allowed: false }
    }
    return { allowed: presaleStatus === 0 }
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
    canEdit,
    canIssue,
    canSetupPresale,
    canClaimAll,
    canOpenPresale,
  }
}
