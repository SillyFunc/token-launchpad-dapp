/** 平台所有智能合约统一自定义错误中文映射表（支持错误名与 4 字节 selector） */
export const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  // CoordinatorFactory 发币入口
  FactoryDisabled: '平台维护中，暂不可发币',
  '0x432acbfd': '平台维护中，暂不可发币',
  InsufficientCreationFee: '发币费不足（需 0.005 BNB）',
  '0x535b7470': '发币费不足（需 0.005 BNB）',
  EmptyTokenName: '请填写代币名称',
  '0xe2592aed': '请填写代币名称',
  EmptyTokenSymbol: '请填写代币符号',
  '0x19c7070a': '请填写代币符号',
  TokenNotRegistered: '代币未在本平台登记',
  '0x259ba1ad': '代币未在本平台登记',
  NotTokenCreator: '仅代币创建者可执行此操作',
  '0x57deb26a': '仅代币创建者可执行此操作',
  AlreadyConfigured: '预售条款已在链上配置过（一次性操作，不可重复修改）',
  '0x11b61b6a': '预售条款已在链上配置过（一次性操作，不可重复修改）',
  InvalidMaxBuyPerWallet: '单钱包上限必须大于 0',
  '0x1a16b58e': '单钱包上限必须大于 0',
  ZeroMinLiquidity: '加池下限必须大于 0',
  '0xff3bfcc7': '加池下限必须大于 0',
  CreatorBuyTokensWithoutFunding: '设置了购买代币目标但未附带购买注资',
  '0xc6614516': '设置了购买代币目标但未附带购买注资',
  '0x6a0c5c36': '设置了购买代币目标但未附带购买注资',
  InvalidSalt: '盐值非法（全零盐通道已废除）',
  '0x81e69d9b': '盐值非法（全零盐通道已废除）',
  InvalidVanitySuffix: '盐对应地址尾号不是 8888 靓号',
  '0x01511986': '盐对应地址尾号不是 8888 靓号',
  InsufficientReservationFee: '地址预留费不足（需 0.01 BNB）',
  '0x3f5aba5f': '地址预留费不足（需 0.01 BNB）',
  AddressAlreadyReserved: '该靓号地址已被他人锁定',
  '0x5e72c18e': '该靓号地址已被他人锁定',
  AddressAlreadyDeployed: '该代币地址已被占用部署',
  '0xd64bf586': '该代币地址已被占用部署',
  NotReserver: '该靓号已被他人预留锁定',
  '0x106874c5': '该靓号已被他人预留锁定',
  InvalidAllocation: '代币分配比例配置非法',
  '0x0baf7432': '代币分配比例配置非法',
  BuyFeeTooHigh: '买入税率不能超过 10%',
  SellFeeTooHigh: '卖出税率不能超过 10%',
  InvalidFeeRecipient: '税费接收地址无效',
  InvalidTaxDuration: '税费存续期必须大于 0',
  InvalidAntiFarmerDuration: '防夹保护期不能超过税费存续期',
  TokenCreationFailed: '代币创建失败',

  // PRESALE 托管仓
  PresaleDisabled: '该代币未开启预售',
  '0xe87ff4be': '该代币未开启预售',
  InvalidPrice: '预售代币价格必须大于 0',
  '0x00bfc921': '预售代币价格必须大于 0',
  InvalidVestingDelay: '释放周期须在 1 分钟至 90 天之间',
  '0x755f0ed3': '释放周期须在 1 分钟至 90 天之间',
  InvalidVestingRate: '每期释放比例须在 5% 至 20% 之间',
  '0x416c61ed': '每期释放比例须在 5% 至 20% 之间',
  InvalidStatus: '当前状态不可执行该操作',
  '0xf525e320': '当前状态不可执行该操作',
  PresaleNotOpen: '预售当前未开放',
  '0x7963e2b5': '预售当前未开放',
  PresaleNotStarted: '预售尚未开始',
  '0x4e16195c': '预售尚未开始',
  PresaleExpired: '预售认购已到期',
  '0x312c6e32': '预售认购已到期',
  PresaleNotExpired: '预售尚未到期，仅创建者可提前结束',
  '0x3deb266e': '预售尚未到期，仅创建者可提前结束',
  InvalidDuration: '认购时长须在 1 分钟至 30 天之间',
  '0x76166401': '认购时长须在 1 分钟至 30 天之间',
  LaunchDeadlineNotReached: '尚在 72 小时开盘窗口期内',
  '0x742e3c2b': '尚在 72 小时开盘窗口期内',
  RefundsOutstanding: '须等待全部认购者退款完毕',
  '0x0d3e2916': '须等待全部认购者退款完毕',
  EscrowDrained: '代币已回收，无法重开',
  '0x174a9bcf': '代币已回收，无法重开',
  ZeroValue: '认购金额必须大于 0',
  '0x7c946ed7': '认购金额必须大于 0',
  AmountTooSmall: '换算代币数量过小',
  '0xc2f5625a': '换算代币数量过小',
  PresaleSoldOut: '预售份额已全部售罄',
  '0xd4556c36': '预售份额已全部售罄',
  WalletLimitExceeded: '超出单钱包认购上限',
  '0x746f4607': '超出单钱包认购上限',
  HardcapReached: '已达募资硬顶',
  '0x5be90159': '已达募资硬顶',
  InsufficientBNB: '加池流动性未达最低门槛',
  '0xbf64110f': '加池流动性未达最低门槛',
  SoftCapTooLow: '预售软顶须不小于加池下限',
  '0xe4b16145': '预售软顶须不小于加池下限',
  SoftCapExceedsHardcap: '软顶不可超过硬顶',
  '0xc0e1152e': '软顶不可超过硬顶',
  TokensAlreadyClaimed: '代币已全部领取，不可重复操作',
  '0xa4f81929': '代币已全部领取，不可重复操作',
  NothingToClaim: '暂无可领取的代币份额',
  '0x969bf728': '暂无可领取的代币份额',
  NoTokensToClaim: '托管仓内无代币可供领取',
  '0x0f3f8610': '托管仓内无代币可供领取',
  NotLaunched: '尚未开盘上线',
  '0x8dda39df': '尚未开盘上线',
  NoShare: '该地址无任何代币份额',
  '0xa153fa9e': '该地址无任何代币份额',
  MigrationStateMismatch: '迁移状态异常，请联系平台',
  '0xd7ce20a0': '迁移状态异常，请联系平台',
  CreatorBuyTooLarge: '创建者购买超出底池 25% 上限',
  '0x452a0e78': '创建者购买超出底池 25% 上限',
  ZeroCreatorBuyValue: '注资额必须大于 0',
  '0x655df0b2': '注资额必须大于 0',
  CreatorBuyLocked: '开盘后不可操作注资',
  '0xbf72d580': '开盘后不可操作注资',
  NoBNBToWithdraw: '无可提取的残留 BNB',
  '0x7e4625d6': '无可提取的残留 BNB',
  NotAfterLaunch: '开盘前不可提取余额',
  '0xa2e5181c': '开盘前不可提取余额',

  // 辅助提示
  PresaleClosed: '预售认购已结束',
  '0x717ee030': '预售认购已结束',
  SoftCapNotReached: '未达到预售软顶条件',
  '0x32ae2021': '未达到预售软顶条件',
  SlippageTooHigh: '滑点不能超过 10%',
  TaxDurationZero: '税费存续期必须大于 0',
  AntiFarmerDurationExceedsTaxDuration: '防挖提卖保护期不能超过税费存续期',
  CreationFeeMismatch: '发币创建费用不匹配',
  TokenSaltAlreadyUsed: '代币 CREATE2 盐值已被占用，请重试',
  AlreadyLaunched: '代币已经加池开盘上线，不可重复操作',
  '0xc824c965': '代币已经加池开盘上线，不可重复操作',
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

  // 1.x 钱包连接账户失效/不匹配（如 MetaMask 报
  // "Simple Keyring - Unable to find matching address"）
  if (
    msg.includes('Unable to find matching address') ||
    msg.includes('Simple Keyring')
  ) {
    return '钱包连接账户已失效（可能在钱包中切换过账户），请切回连接时的账户，或断开后重新连接钱包再试'
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
