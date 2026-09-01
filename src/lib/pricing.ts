import {
  createPublicClient,
  http,
  webSocket,
  parseAbi,
  formatUnits,
  type Address,
  type PublicClient,
} from 'viem'
import { bscTestnet } from 'viem/chains'

export const COORDINATOR = '0xFD20244a99d4331E842e91F04C75032d427B76DD' as Address
export const WBNB = '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd' as Address

export const coordinatorAbi = parseAbi([
  'function tokenPresales(address) view returns (address)',
])

export const presaleAbi = parseAbi([
  'function lpAddress() view returns (address)',
  'function presaleTokenPrice() view returns (uint256)',
  'function getLaunchStatus() view returns (bool enabled, uint256 status, uint256 bnb, uint256 tokens, bool lpAdded, bool claimed)',
])

export const pairAbi = parseAbi([
  'function token0() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'event Sync(uint112 reserve0, uint112 reserve1)',
])

export const tokenAbi = parseAbi([
  'function totalSupply() view returns (uint256)',
])

let readClient: PublicClient | undefined
export function getReadClient(): PublicClient {
  if (!readClient) {
    readClient = createPublicClient({
      chain: bscTestnet,
      transport: http('https://bsc-testnet-rpc.publicnode.com'),
    })
  }
  return readClient
}

let watchClient: PublicClient | undefined
export function getWatchClient(): PublicClient {
  if (!watchClient) {
    watchClient = createPublicClient({
      chain: bscTestnet,
      transport: webSocket('wss://bsc-testnet-rpc.publicnode.com'),
    })
  }
  return watchClient
}

export interface PricingResult {
  stage: 'live' | 'presale' | 'not_launched'
  priceBNB: number | null
  tokenReserve: bigint | null
  bnbReserve: bigint | null
  pair: Address | null
  baselinePriceBNB: number | null
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

const presaleByToken = new Map<string, Promise<Address>>()
export function getPresaleAddress(
  client: PublicClient,
  tokenAddr: Address,
): Promise<Address> {
  const key = tokenAddr.toLowerCase()
  let cached = presaleByToken.get(key)
  if (!cached) {
    cached = client.readContract({
      address: COORDINATOR,
      abi: coordinatorAbi,
      functionName: 'tokenPresales',
      args: [tokenAddr],
    }) as Promise<Address>
    presaleByToken.set(key, cached)
  }
  return cached
}

const pairByPresale = new Map<string, Promise<Address>>()
export function getPairAddress(
  client: PublicClient,
  presale: Address,
): Promise<Address> {
  const key = presale.toLowerCase()
  let cached = pairByPresale.get(key)
  if (!cached) {
    cached = client.readContract({
      address: presale,
      abi: presaleAbi,
      functionName: 'lpAddress',
    }) as Promise<Address>
    pairByPresale.set(key, cached)
  }
  return cached
}

const token0ByPair = new Map<string, Promise<Address>>()
export function getPairToken0(
  client: PublicClient,
  pair: Address,
): Promise<Address> {
  const key = pair.toLowerCase()
  let cached = token0ByPair.get(key)
  if (!cached) {
    cached = client.readContract({
      address: pair,
      abi: pairAbi,
      functionName: 'token0',
    }) as Promise<Address>
    token0ByPair.set(key, cached)
  }
  return cached
}

export async function getPricing(
  client: PublicClient,
  tokenAddr: Address,
): Promise<PricingResult> {
  const presale = await getPresaleAddress(client, tokenAddr)

  if (presale === ZERO_ADDRESS) {
    return { stage: 'not_launched', priceBNB: null, tokenReserve: null, bnbReserve: null, pair: null, baselinePriceBNB: null }
  }

  const pair = await getPairAddress(client, presale)

  if (pair === ZERO_ADDRESS) {
    const status = await client.readContract({
      address: presale,
      abi: presaleAbi,
      functionName: 'getLaunchStatus',
    }) as readonly [boolean, bigint, bigint, bigint, boolean, boolean]

    if (status[0] && Number(status[1]) < 3) {
      const p = await client.readContract({
        address: presale,
        abi: presaleAbi,
        functionName: 'presaleTokenPrice',
      }) as bigint
      if (p > 0n) {
        return { stage: 'presale', priceBNB: Number(formatUnits(p, 18)), tokenReserve: null, bnbReserve: null, pair: null, baselinePriceBNB: null }
      }
    }
    return { stage: 'not_launched', priceBNB: null, tokenReserve: null, bnbReserve: null, pair: null, baselinePriceBNB: null }
  }

  const [t0, [r0, r1]] = await Promise.all([
    getPairToken0(client, pair),
    client.readContract({ address: pair, abi: pairAbi, functionName: 'getReserves' }),
  ]) as [Address, readonly [bigint, bigint, number]]

  const isT0 = t0.toLowerCase() === tokenAddr.toLowerCase()
  const tokenReserve = isT0 ? r0 : r1
  const bnbReserve = isT0 ? r1 : r0

  if (tokenReserve > 0n) {
    const priceBNB = Number(formatUnits(bnbReserve, 18)) / Number(formatUnits(tokenReserve, 18))

    // 读取预售发行价作为涨幅基准
    let baselinePriceBNB: number | null = null
    try {
      const pp = await client.readContract({
        address: presale,
        abi: presaleAbi,
        functionName: 'presaleTokenPrice',
      }) as bigint
      if (pp > 0n) {
        baselinePriceBNB = Number(formatUnits(pp, 18))
      }
    } catch {
      // 纯发币模式无 presaleTokenPrice
    }

    return { stage: 'live', priceBNB, tokenReserve, bnbReserve, pair, baselinePriceBNB }
  }

  return { stage: 'not_launched', priceBNB: null, tokenReserve: null, bnbReserve: null, pair: null, baselinePriceBNB: null }
}

let bnbUsdCache = 0
let bnbUsdTimestamp = 0

export async function getBnbUsd(): Promise<number> {
  const now = Date.now()
  if (bnbUsdCache && now - bnbUsdTimestamp < 30_000) return bnbUsdCache
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT')
    const json = await res.json() as { price: string }
    bnbUsdCache = Number(json.price)
    bnbUsdTimestamp = now
    return bnbUsdCache
  } catch {
    return bnbUsdCache || 0
  }
}

export function calcMcapUsd(priceBNB: number, bnbUsd: number, totalSupply: bigint): number {
  return priceBNB * bnbUsd * Number(formatUnits(totalSupply, 18))
}

export function calcTvlUsd(bnbReserve: bigint, bnbUsd: number): number {
  return Number(formatUnits(bnbReserve, 18)) * 2 * bnbUsd
}