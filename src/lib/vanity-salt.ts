import {
  keccak256,
  hexToBytes,
  bytesToHex,
  getAddress,
  type Hex,
} from 'viem'
import { useEffect, useState, useCallback, useRef } from 'react'

import { DEFAULT_CHAIN_ID, getContractAddresses } from '@/config/network'
import type {
  VanityWorkerInput,
  VanityWorkerOutput,
  VanityWorkerError,
} from '@/workers/vanity-salt.worker'

export const VANITY_SUFFIX = 0x8888

// EIP-1167 极简克隆代码常量（对应合约 Clones.predictDeterministicAddress）
const EIP1167_PREFIX = hexToBytes('0x3d602d80600a3d3981f3363d3d373d3d3d363d73')
const EIP1167_SUFFIX = hexToBytes('0x5af43d82803e903d91602b57fd5bf3')

/**
 * 缓存不同实现合约地址对应的 initCodeHash
 */
const initCodeHashCache = new Map<string, Uint8Array>()

export function getInitCodeHash(flapImplementation: Hex): Uint8Array {
  const key = flapImplementation.toLowerCase()
  const cached = initCodeHashCache.get(key)
  if (cached) return cached

  const implBytes = hexToBytes(flapImplementation)
  const initCode = new Uint8Array(55)
  initCode.set(EIP1167_PREFIX, 0)
  initCode.set(implBytes, 20)
  initCode.set(EIP1167_SUFFIX, 40)

  const hash = hexToBytes(keccak256(initCode))
  initCodeHashCache.set(key, hash)
  return hash
}

export interface PredictTokenAddressOptions {
  tokenFactory?: Hex
  flapImplementation?: Hex
  chainId?: number
}

/**
 * 纯链下预言 CREATE2 代币部署地址，与合约 TokenFactory.predictTokenAddress 100% 对齐
 */
export function predictTokenAddress(
  salt: Hex,
  options: PredictTokenAddressOptions = {},
): Hex {
  const chainId = options.chainId ?? DEFAULT_CHAIN_ID
  const contracts = getContractAddresses(chainId)

  const tokenFactory = options.tokenFactory ?? contracts.tokenFactory
  const flapImplementation =
    options.flapImplementation ?? contracts.flapTaxTokenV3

  const initCodeHash = getInitCodeHash(flapImplementation)

  const buf = new Uint8Array(85)
  buf[0] = 0xff
  buf.set(hexToBytes(tokenFactory), 1)
  buf.set(hexToBytes(salt), 21)
  buf.set(initCodeHash, 53)

  const hash = hexToBytes(keccak256(buf))
  return getAddress(bytesToHex(hash.slice(12)))
}

/**
 * 校验代币地址是否符合全平台 8888 尾号靓号规则 (uint160(addr) & 0xFFFF == 0x8888)
 */
export function isVanity8888(address: string): boolean {
  if (!address || address.length < 4) return false
  return address.toLowerCase().endsWith('8888')
}

export interface VanitySaltResult {
  salt: Hex
  predictedAddress: Hex
  attempts: number
  durationMs: number
}

export interface FindVanitySaltOptions extends PredictTokenAddressOptions {
  maxAttempts?: number
  signal?: AbortSignal
}

/**
 * 快速同步搜盐（单线程零分配紧凑循环）
 */
export function findVanitySaltSync(
  options: FindVanitySaltOptions = {},
): VanitySaltResult {
  const start = performance.now()
  const chainId = options.chainId ?? DEFAULT_CHAIN_ID
  const contracts = getContractAddresses(chainId)
  const tokenFactory = options.tokenFactory ?? contracts.tokenFactory
  const flapImplementation =
    options.flapImplementation ?? contracts.flapTaxTokenV3
  const maxAttempts = options.maxAttempts ?? 1_000_000

  const initCodeHash = getInitCodeHash(flapImplementation)

  const buf = new Uint8Array(85)
  buf[0] = 0xff
  buf.set(hexToBytes(tokenFactory), 1)
  buf.set(initCodeHash, 53)

  // 随机种子：前 24 字节真随机熵，杜绝全网碰撞
  const seed = new Uint8Array(32)
  crypto.getRandomValues(seed)
  buf.set(seed, 21)

  const view = new DataView(buf.buffer, buf.byteOffset + 21, 32)
  let counter = view.getUint32(28, false)

  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    view.setUint32(28, counter++, false)
    const hash = hexToBytes(keccak256(buf))

    if (hash[30] === 0x88 && hash[31] === 0x88) {
      const salt = bytesToHex(buf.slice(21, 53))
      const predictedAddress = getAddress(bytesToHex(hash.slice(12)))
      const durationMs = performance.now() - start
      return { salt, predictedAddress, attempts, durationMs }
    }
  }

  throw new Error(`未在 ${maxAttempts} 次尝试内找到符合 8888 尾缀的盐值`)
}

/**
 * 分批异步兜底搜盐（主线程降级：每 4000 次让渡事件循环，不阻塞 UI 渲染）
 */
export async function findVanitySaltChunked(
  options: FindVanitySaltOptions = {},
): Promise<VanitySaltResult> {
  const start = performance.now()
  const chainId = options.chainId ?? DEFAULT_CHAIN_ID
  const contracts = getContractAddresses(chainId)
  const tokenFactory = options.tokenFactory ?? contracts.tokenFactory
  const flapImplementation =
    options.flapImplementation ?? contracts.flapTaxTokenV3
  const maxAttempts = options.maxAttempts ?? 1_000_000

  const initCodeHash = getInitCodeHash(flapImplementation)

  const buf = new Uint8Array(85)
  buf[0] = 0xff
  buf.set(hexToBytes(tokenFactory), 1)
  buf.set(initCodeHash, 53)

  const seed = new Uint8Array(32)
  crypto.getRandomValues(seed)
  buf.set(seed, 21)

  const view = new DataView(buf.buffer, buf.byteOffset + 21, 32)
  let counter = view.getUint32(28, false)
  const CHUNK_SIZE = 4000

  let attempts = 0
  while (attempts < maxAttempts) {
    if (options.signal?.aborted) {
      throw new Error('搜盐操作已取消')
    }

    const chunkEnd = Math.min(attempts + CHUNK_SIZE, maxAttempts)
    for (; attempts < chunkEnd; attempts++) {
      view.setUint32(28, counter++, false)
      const hash = hexToBytes(keccak256(buf))

      if (hash[30] === 0x88 && hash[31] === 0x88) {
        const salt = bytesToHex(buf.slice(21, 53))
        const predictedAddress = getAddress(bytesToHex(hash.slice(12)))
        const durationMs = performance.now() - start
        return { salt, predictedAddress, attempts: attempts + 1, durationMs }
      }
    }

    // 让渡微任务与渲染帧
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  throw new Error(`未在 ${maxAttempts} 次尝试内找到符合 8888 尾缀的盐值`)
}

/**
 * 统一搜盐方法：优先使用 Web Worker 后台多线程，环境受限时自动降级分批异步
 */
export async function findVanitySalt(
  options: FindVanitySaltOptions = {},
): Promise<VanitySaltResult> {
  const chainId = options.chainId ?? DEFAULT_CHAIN_ID
  const contracts = getContractAddresses(chainId)
  const tokenFactory = options.tokenFactory ?? contracts.tokenFactory
  const flapImplementation =
    options.flapImplementation ?? contracts.flapTaxTokenV3
  const maxAttempts = options.maxAttempts ?? 1_000_000

  // 1. 尝试使用 Web Worker
  if (typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(
        new URL('../workers/vanity-salt.worker.ts', import.meta.url),
        { type: 'module' },
      )

      return await new Promise<VanitySaltResult>((resolve, reject) => {
        const cleanup = () => {
          worker.terminate()
          if (options.signal) {
            options.signal.removeEventListener('abort', handleAbort)
          }
        }

        const handleAbort = () => {
          cleanup()
          reject(new Error('搜盐操作已取消'))
        }

        if (options.signal?.aborted) {
          handleAbort()
          return
        }

        if (options.signal) {
          options.signal.addEventListener('abort', handleAbort)
        }

        worker.onmessage = (
          event: MessageEvent<VanityWorkerOutput | VanityWorkerError>,
        ) => {
          cleanup()
          if ('error' in event.data) {
            reject(new Error(event.data.error))
          } else {
            resolve(event.data)
          }
        }

        worker.onerror = (err) => {
          cleanup()
          // Worker 执行出错时降级到主线程异步分批搜索
          console.warn('Vanity Worker 错误，降级到分批搜索:', err)
          findVanitySaltChunked(options).then(resolve, reject)
        }

        worker.postMessage({
          tokenFactory,
          flapImplementation,
          maxAttempts,
        } satisfies VanityWorkerInput)
      })
    } catch (e) {
      console.warn('创建 Vanity Worker 失败，降级到分批搜索:', e)
    }
  }

  // 2. 降级走分批异步
  return findVanitySaltChunked(options)
}

export interface UseVanitySaltOptions extends PredictTokenAddressOptions {
  autoSearch?: boolean
}

/**
 * React 搜盐 Hook：页面加载时后台静默预搜，表单填写完毕前即就绪；支持主动换号
 */
export function useVanitySalt(options: UseVanitySaltOptions = {}) {
  const { autoSearch = true, chainId = DEFAULT_CHAIN_ID } = options

  const [salt, setSalt] = useState<Hex | null>(null)
  const [predictedAddress, setPredictedAddress] = useState<Hex | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)

  const startSearch = useCallback(() => {
    // 终止前一次未完成的搜索
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsSearching(true)
    setError(null)

    findVanitySalt({
      chainId,
      tokenFactory: options.tokenFactory,
      flapImplementation: options.flapImplementation,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) {
          setSalt(res.salt)
          setPredictedAddress(res.predictedAddress)
          setAttempts(res.attempts)
          setDurationMs(res.durationMs)
          setIsSearching(false)
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : '搜盐失败')
          setIsSearching(false)
        }
      })
  }, [chainId, options.tokenFactory, options.flapImplementation])

  useEffect(() => {
    if (autoSearch) {
      startSearch()
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [autoSearch, startSearch])

  return {
    salt,
    predictedAddress,
    isSearching,
    attempts,
    durationMs,
    error,
    regenerate: startSearch,
  }
}
