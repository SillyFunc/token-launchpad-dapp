import { keccak256, hexToBytes, bytesToHex, getAddress, type Hex } from 'viem'

import { getInitCodeHash } from '@/lib/eip1167'

export interface VanityWorkerInput {
  tokenFactory: Hex
  flapImplementation: Hex
  maxAttempts?: number
}

export interface VanityWorkerOutput {
  salt: Hex
  predictedAddress: Hex
  attempts: number
  durationMs: number
}

export interface VanityWorkerError {
  error: string
}

// 监听主线程消息
self.onmessage = (event: MessageEvent<VanityWorkerInput>) => {
  const { tokenFactory, flapImplementation, maxAttempts = 1_000_000 } = event.data

  try {
    const start = performance.now()

    // 1. EIP-1167 克隆 init code 哈希（常量收敛于 @/lib/eip1167）
    const initCodeHash = getInitCodeHash(flapImplementation)

    // 2. CREATE2 85 字节紧凑单缓冲区：
    // [0]: 0xff (1B)
    // [1..20]: tokenFactory (20B)
    // [21..52]: salt (32B)
    // [53..84]: initCodeHash (32B)
    const buf = new Uint8Array(85)
    buf[0] = 0xff
    buf.set(hexToBytes(tokenFactory), 1)
    buf.set(initCodeHash, 53)

    // 3. 随机熵种子（红线规范：严禁固定值或全网趋同）
    const seed = new Uint8Array(32)
    crypto.getRandomValues(seed)
    buf.set(seed, 21)

    // 在 salt 的后 4 字节（偏移 49..52）上通过 DataView 递增
    const view = new DataView(buf.buffer, buf.byteOffset + 21, 32)
    let counter = view.getUint32(28, false)

    for (let attempts = 1; attempts <= maxAttempts; attempts++) {
      view.setUint32(28, counter++, false)
      const hash = hexToBytes(keccak256(buf))

      // 尾号 8888 校验：uint160(predicted) & 0xFFFF == 0x8888
      // predicted 为 hash 的后 20 字节（[12..31]），其低 16 位即 hash[30] 与 hash[31]
      if (hash[30] === 0x88 && hash[31] === 0x88) {
        const salt = bytesToHex(buf.slice(21, 53))
        const predictedAddress = getAddress(bytesToHex(hash.slice(12)))
        const durationMs = performance.now() - start

        self.postMessage({
          salt,
          predictedAddress,
          attempts,
          durationMs,
        } satisfies VanityWorkerOutput)
        return
      }
    }

    self.postMessage({
      error: `未在 ${maxAttempts} 次尝试内找到符合 8888 尾缀的盐值，请重试`,
    } satisfies VanityWorkerError)
  } catch (err: unknown) {
    self.postMessage({
      error: err instanceof Error ? err.message : '搜盐计算异常',
    } satisfies VanityWorkerError)
  }
}
