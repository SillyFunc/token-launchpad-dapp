import { execSync } from 'child_process'
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const CONTRACTS_REPO =
  process.env.CONTRACTS_REPO ||
  resolve(ROOT, '..', 'token-launchpad-contracts')
const ABI_DIR = resolve(ROOT, 'src', 'contracts', 'abi')
const DOCS_SRC = resolve(CONTRACTS_REPO, 'docs')
const DOCS_DST = resolve(ROOT, 'docs')

const DOCS_FILES = ['frontend-integration.md']

const CONTRACTS: { name: string; file: string }[] = [
  { name: 'TokenFactory', file: 'TokenFactory' },
  { name: 'PresaleFactory', file: 'PresaleFactory' },
  { name: 'CoordinatorFactory', file: 'CoordinatorFactory' },
  { name: 'PRESALE', file: 'Presale' },
  { name: 'FlapTaxTokenV3', file: 'FlapTaxTokenV3' },
]

function main() {
  if (!existsSync(CONTRACTS_REPO)) {
    console.error(`合约项目目录不存在: ${CONTRACTS_REPO}`)
    process.exit(1)
  }
  mkdirSync(ABI_DIR, { recursive: true })

  for (const { name, file } of CONTRACTS) {
    try {
      const stdout = execSync(
        `forge inspect --root "${CONTRACTS_REPO}" --json "${name}" abi`,
        { encoding: 'utf-8' },
      )
      writeFileSync(
        resolve(ABI_DIR, `${file}.json`),
        JSON.stringify(JSON.parse(stdout), null, 2),
      )
      console.log(`✓ ${name} → src/contracts/abi/${file}.json`)
    } catch (err) {
      console.error(
        `✗ ${name}: ${err instanceof Error ? err.message : err}`,
      )
      process.exit(1)
    }
  }

  // 同步文档
  if (existsSync(DOCS_SRC)) {
    mkdirSync(DOCS_DST, { recursive: true })
    for (const doc of DOCS_FILES) {
      const src = resolve(DOCS_SRC, doc)
      const dst = resolve(DOCS_DST, doc)
      if (existsSync(src)) {
        copyFileSync(src, dst)
        console.log(`✓ docs/${doc} → ${dst}`)
      } else {
        console.warn(`⚠ docs/${doc} 不存在于合约项目`)
      }
    }
  }
}

main()