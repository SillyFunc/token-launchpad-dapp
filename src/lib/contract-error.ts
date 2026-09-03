/** 平台所有智能合约统一自定义错误中文映射表（支持错误名与 4 字节 selector） */
export const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  // 基础权限与状态
  TokenNotRegistered: '代币未在本平台登记',
  '0x259ba1ad': '代币未在本平台登记',
  NotTokenCreator: '仅代币创建者可执行此操作',
  '0x57deb26a': '仅代币创建者可执行此操作',
  AlreadyConfigured: '预售条款已在链上配置过（一次性操作，不可重复修改）',
  '0x11b61b6a': '预售条款已在链上配置过（一次性操作，不可重复修改）',
  PresaleNotOpen: '预售当前未开放',
  NoTokensToClaim: '托管仓内无代币可供领取',
  PresaleClosed: '预售认购已结束',
  '0x717ee030': '预售认购已结束',
  SoftCapNotReached: '未达到预售软顶条件',
  '0x32ae2021': '未达到预售软顶条件',
  SoftCapTooLow: '预售软顶须不小于加池下限',
  InvalidPrice: '预售代币价格必须大于 0',
  InvalidMaxBuyPerWallet: '单钱包限购上限必须大于 0',
  ZeroMinLiquidity: '加池下限必须大于 0',
  '0xff3bfcc7': '加池下限必须大于 0',
  CreatorBuyTokensWithoutFunding: '设置了购买代币目标但未附带购买注资',
  '0x6a0c5c36': '设置了购买代币目标但未附带购买注资',
  InvalidVestingDelay: '释放周期须在 1 分钟至 90 天之间',
  '0x755f0ed3': '释放周期须在 1 分钟至 90 天之间',
  InvalidVestingRate: '释放比例须在 5% 至 20% 之间',
  SlippageTooHigh: '滑点不能超过 10%',
  TaxDurationZero: '税费存续期必须大于 0',
  AntiFarmerDurationExceedsTaxDuration: '防挖提卖保护期不能超过税费存续期',
  CreationFeeMismatch: '发币创建费用不匹配',
  TokenSaltAlreadyUsed: '代币 CREATE2 盐值已被占用，请重试',
  AlreadyLaunched: '代币已经加池开盘上线，不可重复操作',
  '0xc824c965': '代币已经加池开盘上线，不可重复操作',
  PresaleSoldOut: '预售份额已全部售罄',
  '0xd4556c36': '预售份额已全部售罄',
}

/**
 * 统一解析 Viem / Wagmi / 钱包弹窗可能抛出的各类链上异常为友好的中文提示
 */
export function parseContractError(
  err: unknown,
  fallback = '交易执行失败，请稍后重试',
  extraMap?: Record<string, string>,
): string {
  if (!err) return fallback

  const msg =
    err instanceof Error
      ? err.message
      : String((err as { shortMessage?: string })?.shortMessage ?? err)

  // 1. 钱包取消/拒绝
  if (
    msg.includes('User rejected') ||
    msg.includes('rejected the request') ||
    msg.includes('user rejected transaction') ||
    msg.includes('User denied transaction signature')
  ) {
    return '用户已在钱包中取消操作'
  }

  // 2. 余额不足支付 Gas 或主币转账
  if (
    msg.includes('insufficient funds') ||
    msg.includes('exceeds balance') ||
    msg.includes('InsufficientFunds')
  ) {
    return '钱包账户余额不足以支付交易或 Gas 费用'
  }

  // 3. 钱包底层 RPC 参数错误（通常由合约试运行 Revert 导致）
  if (
    msg.includes('Invalid parameters were provided to the RPC method') ||
    msg.includes('Internal JSON-RPC error')
  ) {
    if (msg.includes('0x11b61b6a') || msg.includes('AlreadyConfigured')) {
      return '该代币预售条款已在链上配置过（一次性操作，不可重复修改）！请前往控制台直接开启预售'
    }
    return '交易预估失败：参数不符合合约要求或条款已配置，请检查输入'
  }

  // 4. 匹配额外传入的字典
  if (extraMap) {
    for (const [key, text] of Object.entries(extraMap)) {
      if (msg.includes(key)) return text
    }
  }

  // 4. 匹配合约统一错误映射表
  for (const [key, text] of Object.entries(CONTRACT_ERROR_MESSAGES)) {
    if (msg.includes(key)) return text
  }

  // 5. Viem shortMessage 兜底
  const shortMessage = (err as { shortMessage?: string })?.shortMessage
  if (shortMessage && typeof shortMessage === 'string' && shortMessage.length < 120) {
    return shortMessage
  }

  return fallback
}
