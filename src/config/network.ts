import { bsc, bscTestnet, type Chain } from 'viem/chains'
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

export const SUPPORTED_CHAINS = [bscTestnet, bsc] as const

export const DEFAULT_CHAIN: Chain =
  DEFAULT_CHAIN_ID === 56 ? bsc : bscTestnet

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
  contracts: {
    tokenFactory: Hex
    presaleFactory: Hex
    coordinatorFactory: Hex
    flapTaxTokenV3: Hex
    wbnb: Hex
    routerV2: Hex
  }
}

export const CHAINS_CONFIG: Record<56 | 97, ChainMetadata> = {
  // BSC 测试网
  97: {
    id: 97,
    name: 'BNB Smart Chain Testnet',
    displayName: 'BSC 测试网 (ChainId 97)',
    shortName: 'BSC Testnet',
    isTestnet: true,
    nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
    rpcUrls: {
      http: [
        'https://bsc-testnet-rpc.publicnode.com',
        'https://bsc-testnet.blockpi.network/v1/rpc/public',
        'https://data-seed-prebsc-1-s1.binance.org:8545/',
      ],
      webSocket: ['wss://bsc-testnet-rpc.publicnode.com'],
    },
    blockExplorers: {
      name: 'BscScan Testnet',
      url: 'https://testnet.bscscan.com',
    },
    contracts: {
      tokenFactory: '0xab363c6410296A3f39D01d278A34adA9517A5e25',
      presaleFactory: '0x236a6752323324F23301958b06B9b17cB8151294',
      coordinatorFactory: '0xfb5a2029D8464C3dFB4baEaD9ee44853E2f9cA45',
      flapTaxTokenV3: '0x0eB92ffcA94EB424C6fbD93698dB9490533A0AcA',
      wbnb: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
      routerV2: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',
    },
  },
  // BSC 主网（待正式部署后补充实际地址）
  56: {
    id: 56,
    name: 'BNB Smart Chain Mainnet',
    displayName: 'BSC 主网 (ChainId 56)',
    shortName: 'BSC Mainnet',
    isTestnet: false,
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: {
      http: [
        'https://binance.llamarpc.com',
        'https://bsc-dataseed.binance.org/',
        'https://1rpc.io/bnb',
      ],
      webSocket: ['wss://bsc-rpc.publicnode.com'],
    },
    blockExplorers: {
      name: 'BscScan',
      url: 'https://bscscan.com',
    },
    contracts: {
      // 主网部署后更新以下占位
      tokenFactory: '0x0000000000000000000000000000000000000000',
      presaleFactory: '0x0000000000000000000000000000000000000000',
      coordinatorFactory: '0x0000000000000000000000000000000000000000',
      flapTaxTokenV3: '0x0000000000000000000000000000000000000000',
      wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      routerV2: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    },
  },
}

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
