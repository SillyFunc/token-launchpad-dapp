/**
 * 统一响应基础结构
 * @template T 响应体内实际的数据 data 字段类型，默认为 unknown 以保证强类型检验
 */
export interface ApiResponse<T = unknown> {
  data: T
  code: number
  message: string
}