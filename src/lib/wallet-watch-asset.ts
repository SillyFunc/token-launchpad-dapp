import { isAddress, type Hex } from 'viem'

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

export interface WatchErc20AssetParams {
  address: Hex
  symbol: string
  decimals?: number
  image?: string
}

/** 将后台返回的 Logo 规范为钱包可读取的绝对 HTTP(S) URL。 */
function resolveAssetImage(image: string | undefined) {
  if (!image || typeof window === 'undefined') return undefined

  try {
    const url = new URL(image, window.location.origin)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

/**
 * 请求注入钱包跟踪 ERC-20；这是本地钱包资产列表能力，失败不影响链上交易。
 * MetaMask、TokenPocket 等实现 EIP-747 的钱包会显示确认界面。
 */
export async function watchErc20Asset({
  address,
  symbol,
  decimals = 18,
  image,
}: WatchErc20AssetParams): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !window.ethereum?.request ||
    !isAddress(address) ||
    !symbol.trim()
  ) {
    return false
  }

  const assetImage = resolveAssetImage(image)
  const result = await window.ethereum.request({
    method: 'wallet_watchAsset',
    params: {
      type: 'ERC20',
      options: {
        address,
        symbol: symbol.trim(),
        decimals,
        ...(assetImage ? { image: assetImage } : {}),
      },
    },
  })

  return result === true
}
