/**
 * 合约地址按 chainId 管理。
 * 地址来源: ../token-launchpad-contracts/script/deployments (Foundry broadcast)
 */
export const CONTRACT_ADDRESSES = {
  // BSC Testnet
  97: {
    tokenFactory: '0x14bbbb755b03cb109ecc54c59b6bcff8f90e6144',
    presaleFactory: '0xadc0427f6cf23e6a55eb49631e71f06979683562',
    coordinatorFactory: '0xfd20244a99d4331e842e91f04c75032d427b76dd',
    flapTaxTokenV3: '0xeb233e41a6a134c2b7e0dd4cc4ee90dd5478dead',
  },
  // BSC Mainnet — 部署后补充
  // 56: { ... },
} as const satisfies Record<number, Record<string, `0x${string}`>>

export type ChainId = keyof typeof CONTRACT_ADDRESSES

export function getContractAddresses(chainId: number | undefined) {
  return chainId ? CONTRACT_ADDRESSES[chainId as ChainId] : undefined
}
