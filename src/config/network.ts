import { bsc, bscTestnet, mainnet, type Chain } from 'viem/chains'
import type { Hex } from 'viem'

/**
 * 环境变量控制的目标网络，缺省为 BSC 测试网 (97)
 * 在正式网上线时，只需设置 PUBLIC_CHAIN_ID=56 即可一键切换全站
 */
const envChainId = typeof process !== 'undefined' && process.env?.PUBLIC_CHAIN_ID
  ? Number(process.env.PUBLIC_CHAIN_ID)
  : (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_CHAIN_ID
    ? Number((import.meta as any).env.PUBLIC_CHAIN_ID)
    : 97)

export const DEFAULT_CHAIN_ID = (envChainId === 56 ? 56 : 97) as 56 | 97

export const SUPPORTED_CHAINS = [bscTestnet, bsc, mainnet] as const

export const DEFAULT_CHAIN: Chain =
  DEFAULT_CHAIN_ID === 56 ? bsc : bscTestnet

export interface ChainContracts {
  tokenFactory: Hex
  presaleFactory: Hex
  coordinatorFactory: Hex
  flapTaxTokenV3: Hex
  wbnb: Hex
  routerV2: Hex
}

export interface ChainMetadata {
  id: number
  name: string
  displayName: string
  shortName: string
  isTestnet: boolean
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: {
    http: string[]
    webSocket?: string[]
  }
  blockExplorers: {
    name: string
    url: string
  }
  contracts: ChainContracts
}

/**
 * 以 viem 内置 Chain 为链基础身份（name / nativeCurrency / 浏览器）的
 * 单一事实源，此处只补平台差异：节点列表、UI 展示名、合约地址。
 */
function fromViemChain(
  chain: Chain,
  overrides: {
    displayName: string
    shortName: string
    rpcUrls: { http: string[]; webSocket?: string[] }
    contracts: ChainContracts
  },
): ChainMetadata {
  return {
    id: chain.id,
    name: chain.name,
    displayName: overrides.displayName,
    shortName: overrides.shortName,
    isTestnet: Boolean(chain.testnet),
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: overrides.rpcUrls,
    blockExplorers: {
      name: chain.blockExplorers?.default.name ?? '',
      url: chain.blockExplorers?.default.url ?? '',
    },
    contracts: overrides.contracts,
  }
}

export const CHAINS_CONFIG: Record<56 | 97, ChainMetadata> = {
  // BSC 测试网
  97: fromViemChain(bscTestnet, {
    displayName: 'BSC 测试网 (ChainId 97)',
    shortName: 'BSC Testnet',
    rpcUrls: {
      http: [
        'https://bsc-testnet-rpc.publicnode.com',
        'https://bsc-testnet-dataseed.bnbchain.org',
      ],
      webSocket: ['wss://bsc-testnet-rpc.publicnode.com'],
    },
    contracts: {
      coordinatorFactory: '0x75F3532fA566d38954D6eDc9191a74Dfa100E846',
      tokenFactory: '0x4b3401fd1590B3f217DE706B46CE29202f9D3e0c',
      presaleFactory: '0xF9725A4D59F9b48E74D2773b78F82e21B2d433D9',
      flapTaxTokenV3: '0xf751e29110959CB274f131c117408680106822EA',
      wbnb: '0xae13d989daC2F0dEbFf460aC112a837C89BAa7cd',
      routerV2: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',
    },
  }),
  // BSC 主网（待正式部署后补充实际地址）
  56: fromViemChain(bsc, {
    displayName: 'BSC 主网 (ChainId 56)',
    shortName: 'BSC Mainnet',
    rpcUrls: {
      http: [
        // 'https://binance.llamarpc.com',
        'https://bsc-dataseed.binance.org/',
        // 'https://1rpc.io/bnb',
      ],
      webSocket: ['wss://bsc-rpc.publicnode.com'],
    },
    contracts: {
      tokenFactory: '0x04556cBC53C9E994522b008B676958e715545564',
      presaleFactory: '0x7A6B4da821F4b2aDB1432E06E7B7aD2f20972A1A',
      coordinatorFactory: '0xc7284f96716E4FbB3F794CB407D882C29aA653B1',
      flapTaxTokenV3: '0xd7E12EcD6406B993d94F0bC67A4a62681F50AA99',
      wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      routerV2: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    },
  }),
}

/** 以太坊主网仅作钱包网络支持（平台合约未部署），不进入 CHAINS_CONFIG */
export const ETHEREUM_MAINNET_RPC = 'https://ethereum-rpc.publicnode.com'

/** 获取指定或当前默认 Chain 的配置 */
export function getChainConfig(chainId: number = DEFAULT_CHAIN_ID): ChainMetadata {
  return (
    CHAINS_CONFIG[chainId as 56 | 97] ??
    CHAINS_CONFIG[DEFAULT_CHAIN_ID]
  )
}

/** 获取合约地址字典 */
export function getContractAddresses(chainId: number = DEFAULT_CHAIN_ID) {
  return getChainConfig(chainId).contracts
}

/** 生成区块链浏览器链接 */
export function getExplorerUrl(
  hashOrAddress: string,
  type: 'tx' | 'address' = 'address',
  chainId: number = DEFAULT_CHAIN_ID,
): string {
  const base = getChainConfig(chainId).blockExplorers.url
  return `${base}/${type}/${hashOrAddress}`
}

/** 获取链的人类可读名称 */
export function getTargetChainName(chainId: number = DEFAULT_CHAIN_ID): string {
  return getChainConfig(chainId).displayName
}
