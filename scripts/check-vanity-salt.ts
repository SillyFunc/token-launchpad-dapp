/**
 * EIP-1167 / CREATE2 预计算地址「链上对齐」自检。
 *
 * 校验前端离线搜盐逻辑与链上 TokenFactory 是否仍然一致，用来在合约升级后
 * 第一时间发现「搜出来的 8888 地址 ≠ 实际部署地址」这类致命脱钩：
 *
 *   1. 配置的 tokenFactory 在主网/目标链上确有合约代码
 *   2. 配置的 flapTaxTokenV3 与链上 `TokenFactory.flapImplementation()` 一致
 *   3. 对一组盐，本地 `predictTokenAddress(salt)` == 链上 `predictTokenAddress(salt)`
 *   4. 真实跑一次 8888 搜盐，并用链上视图复核搜索结果
 *
 * 一旦这里失败，说明 EIP-1167 字节码模板（src/lib/eip1167.ts）、工厂地址或
 * 实现地址与链上不一致，必须先修复再上线。
 *
 * 运行：bun run check-vanity-salt
 */
import {
  createPublicClient,
  http,
  keccak256,
  toHex,
  type Hex,
} from 'viem'

import {
  DEFAULT_CHAIN,
  DEFAULT_CHAIN_ID,
  getChainConfig,
  getContractAddresses,
} from '../src/config/network'
import { TokenFactoryAbi } from '../src/contracts/abi'
import { findVanitySaltSync, predictTokenAddress } from '../src/lib/vanity-salt'

const chainId = DEFAULT_CHAIN_ID
const chainConfig = getChainConfig(chainId)
const contracts = getContractAddresses(chainId)
const rpcUrl = chainConfig.rpcUrls.http[0]

const client = createPublicClient({
  chain: DEFAULT_CHAIN,
  transport: http(rpcUrl),
})

let failures = 0

function assert(ok: boolean, label: string, detail = ''): void {
  if (ok) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  console.log(`\n链路   : ${chainConfig.displayName} (chainId ${chainId})`)
  console.log(`RPC    : ${rpcUrl}`)
  console.log(`工厂   : ${contracts.tokenFactory}`)
  console.log(`实现(配): ${contracts.flapTaxTokenV3}\n`)

  const code = await client.getBytecode({ address: contracts.tokenFactory })
  assert(
    Boolean(code && code !== '0x'),
    'tokenFactory 在链上存在合约代码',
    '配置的工厂地址在该链上没有代码，请检查 PUBLIC_CHAIN_ID / 合约地址',
  )
  if (!code || code === '0x') {
    process.exit(1)
  }

  const onchainImplementation = (await client.readContract({
    address: contracts.tokenFactory,
    abi: TokenFactoryAbi,
    functionName: 'flapImplementation',
  })) as Hex

  assert(
    onchainImplementation.toLowerCase() ===
      contracts.flapTaxTokenV3.toLowerCase(),
    'flapTaxTokenV3 与链上 flapImplementation 一致',
    `链上=${onchainImplementation} 配置=${contracts.flapTaxTokenV3}`,
  )
  console.log(`实现(链): ${onchainImplementation}\n`)

  // —— 固定盐 + 随机种子盐的逐点对齐 ——
  const salts: Hex[] = [
    toHex(0n, { size: 32 }),
    toHex(1n, { size: 32 }),
    keccak256(toHex('vanity-parity-alpha')),
    keccak256(toHex('vanity-parity-beta')),
    keccak256(toHex(`vanity-parity-${Date.now()}`)),
  ]

  console.log('逐点对齐 (本地 predictTokenAddress vs 链上 predictTokenAddress):')
  for (const salt of salts) {
    const local = predictTokenAddress(salt)
    const onchain = (await client.readContract({
      address: contracts.tokenFactory,
      abi: TokenFactoryAbi,
      functionName: 'predictTokenAddress',
      args: [salt],
    })) as Hex

    assert(
      local.toLowerCase() === onchain.toLowerCase(),
      `${salt.slice(0, 12)}… → ${local}`,
      `链上=${onchain}`,
    )
  }

  // —— 真实 8888 搜盐端到端复核 ——
  console.log('\n8888 搜盐端到端复核:')
  const found = findVanitySaltSync({ maxAttempts: 1_000_000 })
  assert(found.predictedAddress.toLowerCase().endsWith('8888'), '搜盐命中 8888 尾缀')

  const onchainFound = (await client.readContract({
    address: contracts.tokenFactory,
    abi: TokenFactoryAbi,
    functionName: 'predictTokenAddress',
    args: [found.salt],
  })) as Hex

  assert(
    found.predictedAddress.toLowerCase() === onchainFound.toLowerCase(),
    `搜盐地址链上复核 ${found.predictedAddress}`,
    `链上=${onchainFound}`,
  )

  console.log(
    failures === 0
      ? '\n✅ 全部对齐：EIP-1167 常量与链上 TokenFactory 一致。\n'
      : `\n❌ ${failures} 项不一致：请检查 src/lib/eip1167.ts 的 EIP-1167 字节码模板 / 合约地址配置。\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('\n自检执行失败:', err instanceof Error ? err.message : err)
  process.exit(1)
})