import { keccak256, hexToBytes, bytesToHex, getAddress, type Hex } from 'viem'

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

    // 1. EIP-1167 Minimal Proxy Bytecode
    // 3d602d80600a3d3981f3363d3d373d3d3d363d73 + flapImplementation (20B) + 5af43d82803e903d91602b57fd5bf3
    const prefix = hexToBytes('0x3d602d80600a3d3981f3363d3d373d3d3d363d73')
    const implBytes = hexToBytes(flapImplementation)
    const suffix = hexToBytes('0x5af43d82803e903d91602b57fd5bf3')

    const initCode = new Uint8Array(55)
    initCode.set(prefix, 0)
    initCode.set(implBytes, 20)
    initCode.set(suffix, 40)

    const initCodeHash = hexToBytes(keccak256(initCode))

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
