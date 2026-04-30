/**
 * 打包前将版本号设为「年.MMDD.HHMM」：
 * - 第 1 段：四位年份
 * - 第 2 段：月×100+日（如 4 月 28 日 → 428）
 * - 第 3 段：时×100+分（如 14:30 → 1430）
 * 同步写入 package.json 与 package-lock.json 根版本（供 electron-builder / electron-updater）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function packVersion(now: Date): string {
  const y = now.getFullYear()
  const mo = now.getMonth() + 1
  const d = now.getDate()
  const h = now.getHours()
  const mi = now.getMinutes()
  return `${y}.${mo * 100 + d}.${h * 100 + mi}`
}

function main() {
  const version = packVersion(new Date())
  const pkgPath = resolve(__dirname, '../package.json')
  const lockPath = resolve(__dirname, '../package-lock.json')

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }
  pkg.version = version
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')

  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
    version: string
    packages?: Record<string, { version?: string }>
  }
  lock.version = version
  if (lock.packages?.['']) lock.packages[''].version = version
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8')

  console.log(`[bump-version-pack] ${version}`)
}

main()
