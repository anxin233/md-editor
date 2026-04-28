/**
 * 根据 src/utils/shortcutRegistry.ts 中的 shortcutsForReadmeTable() 重写 README 受管区块。
 * 运行：npm run docs:shortcuts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shortcutsForReadmeTable, validateShortcutRegistry } from '../src/utils/shortcutRegistry.ts'

const MARKER_START = '<!-- shortcuts:start -->'
const MARKER_END = '<!-- shortcuts:end -->'

const __dirname = dirname(fileURLToPath(import.meta.url))
const readmePath = resolve(__dirname, '../README.md')

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|')
}

function buildTable(): string {
  validateShortcutRegistry()
  const rows = shortcutsForReadmeTable()
  const lines = ['| 快捷键 | 作用 |', '|--------|------|']
  for (const r of rows) {
    lines.push(`| ${escapeCell(r.keys)} | ${escapeCell(r.label)} |`)
  }
  return lines.join('\n')
}

function main(): void {
  const content = readFileSync(readmePath, 'utf8')
  const startIdx = content.indexOf(MARKER_START)
  const endIdx = content.indexOf(MARKER_END)
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(
      `${readmePath}: 未找到 ${MARKER_START} / ${MARKER_END}；请先在「常用快捷键」一节加入这对标记`
    )
  }
  const before = content.slice(0, startIdx + MARKER_START.length)
  const after = content.slice(endIdx)
  writeFileSync(readmePath, `${before}\n\n${buildTable()}\n\n${after}`, 'utf8')
  console.log('README 快捷键表已更新：', readmePath)
}

main()
