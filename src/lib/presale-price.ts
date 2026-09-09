/** BNB 与平台代币共用的 18 位精度。 */
export const WAD = 10n ** 18n

/**
 * 由本轮硬顶和最多可售代币数量反推单价，并向上取整。
 *
 * 向上取整保证「可售数量 × 单价」不会低于 hardcap，避免售罄后仍无法达到目标募资额。
 */
export function calculatePresaleTokenPrice(
  hardcapWei: bigint,
  maxPresaleTokensWei: bigint,
): bigint | undefined {
  if (hardcapWei <= 0n || maxPresaleTokensWei <= 0n) return undefined

  return (
    (hardcapWei * WAD + maxPresaleTokensWei - 1n) /
    maxPresaleTokensWei
  )
}
