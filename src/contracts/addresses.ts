/**
 * 合约地址按 chainId 管理。
 * 地址来源: ../token-launchpad-contracts/script/deployments (Foundry broadcast)
 */
export const CONTRACT_ADDRESSES = {
  // BSC Testnet
  97: {
    tokenFactory: '0x0609349969a50e14ef0e9b628cce9afb0a183bf9',
    presaleFactory: '0x81754273b6b3dcf536b14c8e37a5154e919a0d19',
    coordinatorFactory: '0xd1ec0390d9847a711a0ccea8aaa383ec59c7680a',
    flapTaxTokenV3: '0x47ab84f2fefd302e92f2806466d1937c6a0914cb',
  },
  // BSC Mainnet — 部署后补充
  // 56: { ... },
} as const satisfies Record<number, Record<string, `0x${string}`>>

export type ChainId = keyof typeof CONTRACT_ADDRESSES

export function getContractAddresses(chainId: number | undefined) {
  return chainId ? CONTRACT_ADDRESSES[chainId as ChainId] : undefined
}
