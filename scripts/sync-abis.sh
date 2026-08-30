#!/usr/bin/env bash
# 从 token-launchpad-contracts (Foundry) 同步 ABI 到 src/contracts/abi/
# 用法: 新增合约后在 CONTRACTS 里加一行，然后 bun run sync-abis
set -euo pipefail

CONTRACTS_REPO="${CONTRACTS_REPO:-../token-launchpad-contracts}"
CONTRACTS=(
  TokenFactory
  PresaleFactory
  CoordinatorFactory
  PRESALE:Presale
  FlapTaxTokenV3
)

cd "$(dirname "$0")/.."
for entry in "${CONTRACTS[@]}"; do
  name="${entry%%:*}"
  file="${entry##*:}"
  forge inspect --root "$CONTRACTS_REPO" --json "$name" abi > "src/contracts/abi/$file.json"
  echo "✓ $name -> src/contracts/abi/$file.json"
done
