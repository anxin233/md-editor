import type { Text } from '@codemirror/state'

/** 列对齐（与 GFM 分隔单元格冒号语义对应；`default` 为不显式写冒号） */
export type MarkdownTableAlignment = 'default' | 'left' | 'center' | 'right'

/** 当前单元格（行索引对应 `MarkdownTableBlock.rows`） */
export interface MarkdownTableCellPosition {
  rowIndex: number
  columnIndex: number
}

export interface MarkdownTableRow {
  lineNumber: number
  from: number
  to: number
  raw: string
  cells: string[]
  kind: 'header' | 'separator' | 'body'
}

export interface MarkdownTableBlock {
  from: number
  to: number
  startLine: number
  endLine: number
  columnCount: number
  rows: MarkdownTableRow[]
  /** 每列对齐，长度与列数一致；序列化分隔行时以此为准 */
  alignments: MarkdownTableAlignment[]
  /** 解析时光标所在单元格 */
  currentCell?: MarkdownTableCellPosition
  /** `to` 是否吞掉表格后紧跟的一个换行（与删除范围一致） */
  trailingNewline: boolean
}

/** 从分隔单元格文本解析对齐方式 */
export function parseSeparatorAlignment(cell: string): MarkdownTableAlignment {
  const t = cell.trim().replace(/\s/g, '')
  const m = t.match(/^(:?)(-+)(:?)$/)
  if (!m) return 'default'
  const left = m[1] === ':'
  const right = m[3] === ':'
  if (left && right) return 'center'
  if (left && !right) return 'left'
  if (!left && right) return 'right'
  return 'default'
}

export function alignmentToSeparatorCell(alignment: MarkdownTableAlignment): string {
  switch (alignment) {
    case 'left':
      return ':---'
    case 'center':
      return ':---:'
    case 'right':
      return '---:'
    default:
      return '---'
  }
}

/** 按 GFM 管道表拆分单元格（首版不处理单元格内转义 `|`） */
export function splitPipeRow(line: string): string[] {
  let s = line.replace(/\r$/, '').trim()
  if (!s.includes('|')) return []
  if (s.startsWith('|')) s = s.slice(1).trimStart()
  if (s.endsWith('|')) s = s.slice(0, -1).trimEnd()
  if (!s) return []
  return s.split('|').map((c) => c.trim())
}

/** 源码严格表格仅接受首尾均为 `|` 的管道行，避免正文「foo | bar」被误判为表格行 */
function isBoundaryPipeRow(line: string): boolean {
  const t = line.replace(/\r$/, '').trim()
  return t.startsWith('|') && t.endsWith('|')
}

export function isSeparatorCell(cell: string): boolean {
  return /^:?-{3,}:?$/.test(cell.trim())
}

export function isSeparatorRow(line: string): boolean {
  if (!isBoundaryPipeRow(line)) return false
  const cells = splitPipeRow(line)
  return cells.length > 0 && cells.every(isSeparatorCell)
}

export function columnIndexAtPipeRow(raw: string, offset: number): number {
  const line = raw.replace(/\r/g, '')
  const o = Math.max(0, Math.min(offset, line.length))
  const pipes: number[] = []
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '|') pipes.push(i)
  }
  if (pipes.length < 2) return 0
  for (let c = 0; c < pipes.length - 1; c++) {
    const a = pipes[c]
    const b = pipes[c + 1]
    const innerStart = a + 1
    const innerEnd = b
    if (o > innerStart && o <= innerEnd) return c
    if (o === innerStart) return c
    if (o === a && c === 0 && line.trimStart().startsWith('|')) return 0
  }
  return pipes.length - 2
}

function buildRow(doc: Text, lineNum: number, kind: MarkdownTableRow['kind']): MarkdownTableRow {
  const line = doc.line(lineNum)
  const cells = splitPipeRow(line.text)
  return {
    lineNumber: lineNum,
    from: line.from,
    to: line.to,
    raw: line.text,
    cells,
    kind,
  }
}

function containsPipe(line: string): boolean {
  return line.includes('|')
}

/**
 * 严格表格（边界管道）：表头、分隔行、body 均须首尾 `|`；列数一致；body 向下扩展至空行、
 * 非边界管道行或列数不符为止。不从「任意含 | 的行」向上无脑扩展。
 */
export function parseMarkdownTableAt(doc: Text, pos: number): MarkdownTableBlock | null {
  const curLine = doc.lineAt(pos)
  if (!containsPipe(curLine.text)) return null

  const curNum = curLine.number
  const lo = Math.max(2, curNum - 120)
  const hi = Math.min(doc.lines, curNum + 120)

  for (let sepLn = lo; sepLn <= hi; sepLn++) {
    const sepText = doc.line(sepLn).text
    if (!isSeparatorRow(sepText)) continue

    const headerLn = sepLn - 1
    const headerText = doc.line(headerLn).text
    if (isSeparatorRow(headerText)) continue
    if (!containsPipe(headerText)) continue
    if (!isBoundaryPipeRow(headerText)) continue

    const sepCells = splitPipeRow(sepText)
    const hdrCells = splitPipeRow(headerText)
    if (sepCells.length === 0 || hdrCells.length !== sepCells.length) continue

    const columnCount = hdrCells.length
    const alignments = sepCells.map(parseSeparatorAlignment)
    if (alignments.length !== columnCount) continue

    const rows: MarkdownTableRow[] = [
      buildRow(doc, headerLn, 'header'),
      buildRow(doc, sepLn, 'separator'),
    ]

    let ln = sepLn + 1
    while (ln <= doc.lines) {
      const lt = doc.line(ln).text
      if (lt.trim() === '') break
      if (!containsPipe(lt)) break
      if (!isBoundaryPipeRow(lt)) break
      if (isSeparatorRow(lt)) break
      const cells = splitPipeRow(lt)
      if (cells.length !== columnCount) break
      rows.push(buildRow(doc, ln, 'body'))
      ln++
    }

    const tableStart = doc.line(headerLn).from
    const endLineNum = ln - 1
    const tableEndLine = doc.line(endLineNum).to
    let rangeTo = tableEndLine
    let trailingNewline = false
    if (rangeTo < doc.length && doc.sliceString(rangeTo, rangeTo + 1) === '\n') {
      rangeTo += 1
      trailingNewline = true
    }

    if (curNum < headerLn || curNum > endLineNum) continue

    const headerRow = rows[0]!
    const sepRow = rows[1]!
    if (headerRow.cells.length !== columnCount || sepRow.cells.length !== columnCount) continue

    const offsetInLine = pos - curLine.from
    const rowIndex = rows.findIndex((r) => r.lineNumber === curNum)
    const columnIndex =
      rowIndex >= 0
        ? Math.min(
            Math.max(0, columnIndexAtPipeRow(curLine.text, offsetInLine)),
            columnCount - 1,
          )
        : 0

    return {
      from: tableStart,
      to: rangeTo,
      startLine: headerLn,
      endLine: endLineNum,
      columnCount,
      rows,
      alignments,
      currentCell: rowIndex >= 0 ? { rowIndex, columnIndex } : undefined,
      trailingNewline,
    }
  }

  return null
}

export function serializeMarkdownTable(block: MarkdownTableBlock): string {
  return block.rows
    .map((r) => {
      if (r.kind === 'separator') {
        return '| ' + block.alignments.map(alignmentToSeparatorCell).join(' | ') + ' |'
      }
      return '| ' + r.cells.join(' | ') + ' |'
    })
    .join('\n')
}

export function setColumnAlignment(
  block: MarkdownTableBlock,
  colIdx: number,
  alignment: MarkdownTableAlignment,
): MarkdownTableBlock {
  const b = cloneBlock(block)
  const i = Math.max(0, Math.min(colIdx, b.columnCount - 1))
  b.alignments = [...b.alignments]
  b.alignments[i] = alignment
  return b
}

function cloneBlock(block: MarkdownTableBlock): MarkdownTableBlock {
  return {
    ...block,
    alignments: [...block.alignments],
    rows: block.rows.map((r) => ({
      ...r,
      cells: [...r.cells],
    })),
  }
}

/** 在分隔行之下插入 body 行：`afterPhyIdx` 为插入位置（新行占据该下标） */
export function tableInsertBodyRowAt(block: MarkdownTableBlock, insertPhyIdx: number): MarkdownTableBlock {
  const b = cloneBlock(block)
  const empty = Array(block.columnCount).fill('')
  const row: MarkdownTableRow = {
    lineNumber: 0,
    from: 0,
    to: 0,
    raw: '',
    cells: [...empty],
    kind: 'body',
  }
  b.rows.splice(insertPhyIdx, 0, row)
  return b
}

/** 点击行在 rows 中的物理下标 */
export function physicalRowIndex(block: MarkdownTableBlock, lineNumber: number): number {
  return block.rows.findIndex((r) => r.lineNumber === lineNumber)
}

/** 插入到当前行下方（body）；表头/分隔行视作在第一条数据位置插入 */
export function insertRowBelow(block: MarkdownTableBlock, phyIdx: number): MarkdownTableBlock {
  const insertAt = phyIdx <= 1 ? 2 : phyIdx + 1
  return tableInsertBodyRowAt(block, insertAt)
}

/** 插入到当前行上方（body）；表头/分隔行视作在第一条数据行上方 */
export function insertRowAbove(block: MarkdownTableBlock, phyIdx: number): MarkdownTableBlock {
  const insertAt = phyIdx <= 1 ? 2 : phyIdx
  return tableInsertBodyRowAt(block, insertAt)
}

/** 仅删除 body 行 */
export function deleteBodyRow(block: MarkdownTableBlock, phyIdx: number): MarkdownTableBlock | null {
  if (phyIdx < 2 || phyIdx >= block.rows.length) return null
  const b = cloneBlock(block)
  b.rows.splice(phyIdx, 1)
  return b
}

export function insertColumnLeft(block: MarkdownTableBlock, colIdx: number): MarkdownTableBlock {
  const b = cloneBlock(block)
  const i = Math.max(0, Math.min(colIdx, block.columnCount))
  for (const row of b.rows) {
    const cell = row.kind === 'separator' ? '---' : ''
    row.cells.splice(i, 0, cell)
  }
  b.alignments.splice(i, 0, 'default')
  b.columnCount += 1
  return b
}

export function insertColumnRight(block: MarkdownTableBlock, colIdx: number): MarkdownTableBlock {
  return insertColumnLeft(block, colIdx + 1)
}

export function deleteColumn(block: MarkdownTableBlock, colIdx: number): MarkdownTableBlock | null {
  if (block.columnCount <= 1) return null
  const i = Math.max(0, Math.min(colIdx, block.columnCount - 1))
  const b = cloneBlock(block)
  for (const row of b.rows) {
    row.cells.splice(i, 1)
  }
  b.alignments.splice(i, 1)
  b.columnCount -= 1
  return b
}
