import type { EditorState, Transaction } from '@milkdown/prose/state'
import type { Node as ProseNode, NodeType } from '@milkdown/prose/model'
import type { MarkdownTableAlignment } from '@/utils/markdownTable'

export type PmTableAlignment = MarkdownTableAlignment

export interface PmTableCellInfo {
  rowIndex: number
  columnIndex: number
  from: number
  to: number
  node: ProseNode
}

export interface PmTableRowInfo {
  rowIndex: number
  from: number
  to: number
  node: ProseNode
  cells: PmTableCellInfo[]
}

export interface PmTableTarget {
  tableFrom: number
  tableTo: number
  tableNode: ProseNode
  rowIndex: number
  columnIndex: number
  rows: PmTableRowInfo[]
  columnCount: number
}

function isTableRowNode(name: string): boolean {
  return (
    name === 'table_row' ||
    name === 'tableRow' ||
    name === 'table_header_row' ||
    name === 'tableHeaderRow'
  )
}

function isTableCellNode(name: string): boolean {
  return (
    name === 'table_cell' ||
    name === 'tableCell' ||
    name === 'table_header' ||
    name === 'tableHeader'
  )
}

function pmCellHasAlignmentAttr(cellType: NodeType): boolean {
  const attrs = cellType.spec.attrs
  return attrs != null && Object.prototype.hasOwnProperty.call(attrs, 'alignment')
}

export function pmTableSupportsColumnAlignment(_state: EditorState, target: PmTableTarget): boolean {
  for (const row of target.rows) {
    for (const c of row.cells) {
      if (!pmCellHasAlignmentAttr(c.node.type)) return false
    }
  }
  return target.rows.length > 0
}

/** 从右键坐标解析表格；行列不齐或无法落在单元格内时返回 null */
export function resolvePmTableTarget(state: EditorState, pos: number): PmTableTarget | null {
  const $pos = state.doc.resolve(pos)
  let tableDepth = -1
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === 'table') {
      tableDepth = d
      break
    }
  }
  if (tableDepth < 0) return null

  const tableNode = $pos.node(tableDepth)
  const tableFrom = $pos.before(tableDepth)
  const tableTo = $pos.after(tableDepth)

  const rows: PmTableRowInfo[] = []
  let columnCount = 0

  let scan = tableFrom + 1
  for (let r = 0; r < tableNode.childCount; r++) {
    const rowNode = tableNode.child(r)
    if (!isTableRowNode(rowNode.type.name)) {
      scan += rowNode.nodeSize
      continue
    }
    const rowFrom = scan
    const rowTo = scan + rowNode.nodeSize
    const cells: PmTableCellInfo[] = []
    let inner = rowFrom + 1
    for (let c = 0; c < rowNode.childCount; c++) {
      const cellNode = rowNode.child(c)
      if (!isTableCellNode(cellNode.type.name)) {
        inner += cellNode.nodeSize
        continue
      }
      const cellFrom = inner
      const cellTo = inner + cellNode.nodeSize
      cells.push({ rowIndex: r, columnIndex: c, from: cellFrom, to: cellTo, node: cellNode })
      inner += cellNode.nodeSize
    }
    rows.push({ rowIndex: r, from: rowFrom, to: rowTo, node: rowNode, cells })
    if (cells.length === 0) return null
    columnCount = columnCount === 0 ? cells.length : columnCount
    if (cells.length !== columnCount) return null
    scan = rowTo
  }

  if (rows.length === 0 || columnCount === 0) return null

  let rowIndex = -1
  let columnIndex = -1
  for (const row of rows) {
    for (const cell of row.cells) {
      if (pos >= cell.from && pos < cell.to) {
        rowIndex = row.rowIndex
        columnIndex = cell.columnIndex
        break
      }
    }
    if (rowIndex >= 0) break
  }
  if (rowIndex < 0) return null

  return { tableFrom, tableTo, tableNode, rowIndex, columnIndex, rows, columnCount }
}

function rebuildTableTransaction(state: EditorState, target: PmTableTarget, newRows: ProseNode[]): Transaction | null {
  const tableType = target.tableNode.type
  const newTable = tableType.create(target.tableNode.attrs, newRows)
  return state.tr.replaceWith(target.tableFrom, target.tableTo, newTable)
}

function createBodyRowFromTemplate(state: EditorState, columnCount: number, templateRow: ProseNode | null): ProseNode | null {
  const rowType = state.schema.nodes.table_row || state.schema.nodes.tableRow
  const cellType = state.schema.nodes.table_cell || state.schema.nodes.tableCell
  const paragraphType = state.schema.nodes.paragraph
  if (!rowType || !cellType || !paragraphType) return null

  const cells: ProseNode[] = []
  for (let c = 0; c < columnCount; c++) {
    let attrs: Record<string, unknown> = { alignment: 'left' }
    if (templateRow && c < templateRow.childCount) {
      const ref = templateRow.child(c)
      attrs = { ...ref.attrs, alignment: (ref.attrs as { alignment?: string }).alignment ?? 'left' }
    }
    const p = paragraphType.create()
    const cell = cellType.createAndFill(attrs as never, p)
    if (!cell) return null
    cells.push(cell)
  }
  return rowType.create(null, cells)
}

function cloneEmptyCell(state: EditorState, refCell: ProseNode): ProseNode | null {
  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) return null
  const p = paragraphType.create()
  return refCell.type.createAndFill({ ...refCell.attrs } as never, p)
}

export function insertPmTableRowAbove(state: EditorState, target: PmTableTarget): Transaction | null {
  const insertIdx = target.rowIndex === 0 ? 1 : target.rowIndex
  const templateRowIdx = target.rowIndex <= 1 ? Math.min(1, target.tableNode.childCount - 1) : target.rowIndex
  const templateRow = target.tableNode.child(templateRowIdx)
  const newRow = createBodyRowFromTemplate(state, target.columnCount, templateRow)
  if (!newRow) return null
  const children: ProseNode[] = []
  for (let i = 0; i < target.tableNode.childCount; i++) {
    if (i === insertIdx) children.push(newRow)
    children.push(target.tableNode.child(i))
  }
  return rebuildTableTransaction(state, target, children)
}

export function insertPmTableRowBelow(state: EditorState, target: PmTableTarget): Transaction | null {
  const insertIdx = target.rowIndex === 0 ? 1 : target.rowIndex + 1
  const templateRowIdx =
    target.rowIndex === 0 ? Math.min(1, target.tableNode.childCount - 1) : target.rowIndex
  const templateRow = target.tableNode.child(templateRowIdx)
  const newRow = createBodyRowFromTemplate(state, target.columnCount, templateRow)
  if (!newRow) return null
  const children: ProseNode[] = []
  for (let i = 0; i < target.tableNode.childCount; i++) {
    children.push(target.tableNode.child(i))
    if (i === insertIdx - 1) children.push(newRow)
  }
  return rebuildTableTransaction(state, target, children)
}

export function deletePmTableRow(state: EditorState, target: PmTableTarget): Transaction | null {
  if (target.rowIndex === 0) return null
  const children: ProseNode[] = []
  for (let i = 0; i < target.tableNode.childCount; i++) {
    if (i !== target.rowIndex) children.push(target.tableNode.child(i))
  }
  return rebuildTableTransaction(state, target, children)
}

export function insertPmTableColumnLeft(state: EditorState, target: PmTableTarget): Transaction | null {
  const colIdx = target.columnIndex
  const newRows: ProseNode[] = []
  for (let r = 0; r < target.tableNode.childCount; r++) {
    const rowNode = target.tableNode.child(r)
    if (!isTableRowNode(rowNode.type.name)) {
      newRows.push(rowNode)
      continue
    }
    const cells: ProseNode[] = []
    for (let c = 0; c < rowNode.childCount; c++) {
      if (c === colIdx) {
        const ref = rowNode.child(c)
        const empty = cloneEmptyCell(state, ref)
        if (!empty) return null
        cells.push(empty)
      }
      cells.push(rowNode.child(c))
    }
    const nr = rowNode.type.create(rowNode.attrs, cells)
    newRows.push(nr)
  }
  return rebuildTableTransaction(state, target, newRows)
}

export function insertPmTableColumnRight(state: EditorState, target: PmTableTarget): Transaction | null {
  const colIdx = target.columnIndex
  const newRows: ProseNode[] = []
  for (let r = 0; r < target.tableNode.childCount; r++) {
    const rowNode = target.tableNode.child(r)
    if (!isTableRowNode(rowNode.type.name)) {
      newRows.push(rowNode)
      continue
    }
    const cells: ProseNode[] = []
    for (let c = 0; c < rowNode.childCount; c++) {
      cells.push(rowNode.child(c))
      if (c === colIdx) {
        const ref = rowNode.child(c)
        const empty = cloneEmptyCell(state, ref)
        if (!empty) return null
        cells.push(empty)
      }
    }
    const nr = rowNode.type.create(rowNode.attrs, cells)
    newRows.push(nr)
  }
  return rebuildTableTransaction(state, target, newRows)
}

export function deletePmTableColumn(state: EditorState, target: PmTableTarget): Transaction | null {
  if (target.columnCount <= 1) return null
  const colIdx = target.columnIndex
  const newRows: ProseNode[] = []
  for (let r = 0; r < target.tableNode.childCount; r++) {
    const rowNode = target.tableNode.child(r)
    if (!isTableRowNode(rowNode.type.name)) {
      newRows.push(rowNode)
      continue
    }
    if (rowNode.childCount !== target.columnCount) return null
    const cells: ProseNode[] = []
    for (let c = 0; c < rowNode.childCount; c++) {
      if (c !== colIdx) cells.push(rowNode.child(c))
    }
    const nr = rowNode.type.create(rowNode.attrs, cells)
    newRows.push(nr)
  }
  return rebuildTableTransaction(state, target, newRows)
}

function pmAttrAlignmentValue(alignment: MarkdownTableAlignment): string | null {
  switch (alignment) {
    case 'default':
      return null
    case 'left':
      return 'left'
    case 'center':
      return 'center'
    case 'right':
      return 'right'
    default:
      return 'left'
  }
}

export function setPmTableColumnAlignment(
  state: EditorState,
  target: PmTableTarget,
  alignment: MarkdownTableAlignment,
): Transaction | null {
  if (!pmTableSupportsColumnAlignment(state, target)) return null
  const v = pmAttrAlignmentValue(alignment)
  const newRows: ProseNode[] = []
  for (let r = 0; r < target.tableNode.childCount; r++) {
    const rowNode = target.tableNode.child(r)
    if (!isTableRowNode(rowNode.type.name)) {
      newRows.push(rowNode)
      continue
    }
    const cells: ProseNode[] = []
    for (let c = 0; c < rowNode.childCount; c++) {
      const cell = rowNode.child(c)
      if (c === target.columnIndex) {
        const attrs = { ...cell.attrs } as Record<string, unknown>
        if (v == null) delete attrs.alignment
        else attrs.alignment = v
        const newCell = cell.type.create(attrs as never, cell.content, cell.marks)
        cells.push(newCell)
      } else {
        cells.push(cell)
      }
    }
    const nr = rowNode.type.create(rowNode.attrs, cells)
    newRows.push(nr)
  }
  return rebuildTableTransaction(state, target, newRows)
}
