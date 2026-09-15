import {
  keccak256,
  hexToBytes,
  bytesToHex,
  getAddress,
  type Hex,
} from 'viem'

/**
 * EIP-1167 极简克隆（minimal proxy）init code 模板的固定部分 —— 唯一事实源。
 *
 * 完整 55 字节 = PREFIX(20) ‖ 实现合约地址(20) ‖ SUFFIX(15)：
 *   3d602d80600a3d3981f3 363d3d373d3d3d363d73 <impl> 5af43d82803e903d91602b57fd5bf3
 *
 * PREFIX 末尾的 `73` 是 PUSH20，其后 20 字节即实现地址。
 * 该字节码必须与链上 TokenFactory 使用的 OpenZeppelin Clones 模板逐字节一致，
 * 否则 CREATE2 预计算地址无法与实际部署地址对齐（见 docs/frontend-integration.md 2.4）。
 *
 * ⚠️ 仅在「克隆机制 / 字节码模板」变化时才需要修改这里（换克隆库、加构造参数、
 * 换部署方式等）。仅仅更换实现合约地址不需要改动 —— 地址由调用方作为参数注入。
 * 修改后请运行 `bun run check-vanity-salt` 做链上对齐自检。
 */
export const EIP1167_PREFIX = hexToBytes(
  '0x3d602d80600a3d3981f3363d3d373d3d3d363d73',
)
export const EIP1167_SUFFIX = hexToBytes('0x5af43d82803e903d91602b57fd5bf3')

/** 组装 55 字节 EIP-1167 克隆 init code：PREFIX(20) ‖ 实现地址(20) ‖ SUFFIX(15) */
export function buildCloneInitCode(flapImplementation: Hex): Uint8Array {
  const initCode = new Uint8Array(55)
  initCode.set(EIP1167_PREFIX, 0)
  initCode.set(hexToBytes(flapImplementation), 20)
  initCode.set(EIP1167_SUFFIX, 40)
  return initCode
}

/** 缓存不同实现合约地址对应的 initCodeHash */
const initCodeHashCache = new Map<string, Uint8Array>()

/** 计算 EIP-1167 克隆 init code 的 keccak256，按实现地址缓存 */
export function getInitCodeHash(flapImplementation: Hex): Uint8Array {
  const key = flapImplementation.toLowerCase()
  const cached = initCodeHashCache.get(key)
  if (cached) return cached

  const hash = hexToBytes(keccak256(buildCloneInitCode(flapImplementation)))
  initCodeHashCache.set(key, hash)
  return hash
}

export interface PredictCloneAddressParams {
  tokenFactory: Hex
  flapImplementation: Hex
  salt: Hex
}

/**
 * 纯链下预计算 CREATE2 克隆地址（EIP-1014 + EIP-1167），与合约
 * TokenFactory.predictTokenAddress 100% 对齐。
 * 公式：keccak256(0xff ‖ tokenFactory ‖ salt ‖ keccak256(initCode))[12:]
 */
export function predictCloneAddress({
  tokenFactory,
  flapImplementation,
  salt,
}: PredictCloneAddressParams): Hex {
  const initCodeHash = getInitCodeHash(flapImplementation)

  const buf = new Uint8Array(85)
  buf[0] = 0xff
  buf.set(hexToBytes(tokenFactory), 1)
  buf.set(hexToBytes(salt), 21)
  buf.set(initCodeHash, 53)

  const hash = hexToBytes(keccak256(buf))
  return getAddress(bytesToHex(hash.slice(12)))
}
