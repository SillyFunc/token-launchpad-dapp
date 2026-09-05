import type { Hex } from 'viem'

/**
 * 预留盐值本地存档。
 *
 * 存的不是 CA 地址（预留列表以链上为准），仅是 salt ↔ token 映射：
 * 链上 TokenAddressReserved 事件不含盐值，合约也无按地址反查盐值的视图，
 * 而预留地址必须携带原盐值调用 createToken 兑现（NotReserver 校验），
 * 盐值一旦丢失该保留地址即作废。生成未锁定的盐不存档，刷新即失。
 */
const STORAGE_KEY = 'launchpad.reservedSalts.v1'

export interface ReservedSaltRecord {
  salt: Hex
  /** 本地 CREATE2 预言出的代币地址 */
  token: Hex
  /** 锁定成功时间戳（毫秒），未锁定为 null */
  reservedAt: number | null
  /** 锁定交易哈希 */
  txHash: Hex | null
}

function isHex(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value)
}

function readAll(): ReservedSaltRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is ReservedSaltRecord =>
        typeof item === 'object' &&
        item !== null &&
        isHex((item as ReservedSaltRecord).salt) &&
        isHex((item as ReservedSaltRecord).token),
    )
  } catch {
    return []
  }
}

function writeAll(records: ReservedSaltRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // 存储异常时静默降级：不影响本次锁定，仅影响后续用盐值兑现
  }
}

/** 锁定成功后存档 salt ↔ token 映射（盐值仅此时机落库，供后续 createToken 兑现） */
export function markSaltReserved(salt: Hex, token: Hex, txHash: Hex) {
  const records = readAll()
  const key = salt.toLowerCase()
  const record = records.find((r) => r.salt.toLowerCase() === key)
  if (record) {
    record.token = token
    record.reservedAt = Date.now()
    record.txHash = txHash
  } else {
    records.push({ salt, token, reservedAt: Date.now(), txHash })
  }
  writeAll(records)
}

/** 按代币地址反查盐值（供 createToken 兑现预留地址） */
export function getSaltByToken(token: string): Hex | null {
  const key = token.toLowerCase()
  const record = readAll().find((r) => r.token.toLowerCase() === key)
  return record?.salt ?? null
}

export function getReservedSaltRecords(): ReservedSaltRecord[] {
  return readAll()
}
