import type { ApiResponse } from '@/api/types'
import axios, { type AxiosRequestConfig } from 'axios'

/**
 * 业务逻辑异常类
 * 继承自 Error，可提供强类型的 code 和 msg 以供业务逻辑捕获和判断
 */
export class ApiError extends Error {
  public readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'ApiError'
    // 恢复原型链以确保 instanceof 能够正常工作
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}

// 扩展 AxiosRequestConfig，支持自定义配置
declare module 'axios' {
  interface AxiosRequestConfig {
    /** 是否屏蔽全局错误弹窗提示（默认 false） */
    silent?: boolean
  }
}

const instance = axios.create({
  baseURL: 'https://pumpapi.anxchain.online/',
  timeout: 10000,
  responseType: 'json',
  withCredentials: true,
})

instance.defaults.transformRequest = [
  (data, headers) => {
    if (
      data instanceof FormData ||
      data instanceof URLSearchParams ||
      data === null ||
      typeof data !== 'object'
    ) {
      // FormData 原样返回，浏览器会自动设置 multipart boundary
      return data
    }
    // 对象中含有 Blob/File 时，统一转为 FormData 以 multipart 上传
    if (Object.values(data).some((v) => v instanceof Blob)) {
      const formData = new FormData()
      Object.entries(data).forEach(([key, value]) => {
        if (value === undefined || value === null) return
        if (Array.isArray(value)) {
          value.forEach((item) => formData.append(key, item as Blob | string))
        } else {
          formData.append(key, value as Blob | string)
        }
      })
      return formData
    }
    if (headers.getContentType?.()?.includes('application/json')) {
      return data
    }
    const params = new URLSearchParams()
    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined || value === null) return
      if (Array.isArray(value)) {
        value.forEach((item) => params.append(key, String(item)))
      } else {
        params.append(key, String(value))
      }
    })
    headers.setContentType('application/x-www-form-urlencoded')
    return params.toString()
  },
]

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error)
  },
)

function unwrap<T>(res: ApiResponse<T>, silent = false): T {
  if (res.code === 0) {
    return (res.data !== undefined ? res.data : res) as T
  }
  if (!silent) {
    console.log(res.message)
  }
  throw new ApiError(res.code, res.message || '业务请求失败')
}

export async function post<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await instance.post<ApiResponse<T>>(url, data, config)
  return unwrap(res.data, config?.silent)
}
