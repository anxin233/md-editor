import type { EditorView as CMEditorView } from '@codemirror/view'
import type { Text } from '@codemirror/state'
import type { EditorView as PMEditorView } from '@milkdown/prose/view'
import type { EditorState } from '@milkdown/prose/state'
import type { ContextMenuEntry } from '@/stores/contextMenu'
import { useEditorStore } from '@/stores/editor'
import { dispatchAppCommand } from '@/utils/appCommands'
import { isWysiwygFormatCommandSupported } from '@/utils/editorCommands'
import { buildCodeMirrorTextMenu, buildWysiwygTextMenu } from '@/utils/contextMenuRegistry'
import {
  parseMarkdownTableAt,
  serializeMarkdownTable,
  insertRowAbove,
  insertRowBelow,
  deleteBodyRow,
  insertColumnLeft,
  insertColumnRight,
  deleteColumn,
  physicalRowIndex,
  setColumnAlignment,
  type MarkdownTableBlock,
} from '@/utils/markdownTable'
import {
  resolvePmTableTarget,
  pmTableSupportsColumnAlignment,
} from '@/utils/proseMirrorTable'

/** 源码模式：光标所在行的 Markdown 语义（启发式） */
export type CMHitKind =
  | 'image'
  | 'link'
  | 'code-block'
  | 'math-block'
  | 'table'
  | 'task-list'
  | 'list'
  | 'blockquote'
  | 'heading'
  | 'paragraph'

export interface CMHit {
  kind: CMHitKind
  headingLevel?: number
  url?: string
  linkText?: string
  range?: { from: number; to: number }
  /** 可安全删除的表格文档范围（仅严格解析成功时有值） */
  tableBlockRange?: { from: number; to: number }
  /** 严格解析后的 GFM 表格（行列编辑依赖此结构） */
  markdownTable?: MarkdownTableBlock
}

export type PMHitKind =
  | 'table'
  | 'image'
  | 'link'
  | 'code-block'
  | 'task-list'
  | 'list'
  | 'blockquote'
  | 'heading'
  | 'paragraph'

export interface PMHit {
  kind: PMHitKind
  href?: string
}

function isFenceDelimiterLine(text: string): boolean {
  return /^\s*```[\w-]*\s*$/.test(text)
}

function inCodeFence(doc: Text, pos: number): boolean {
  let open = false
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    if (pos >= line.from && pos <= line.to) {
      if (isFenceDelimiterLine(line.text)) return false
      return open
    }
    if (isFenceDelimiterLine(line.text)) open = !open
  }
  return false
}

function isMathDelimiterLine(text: string): boolean {
  return text.trim() === '$$'
}

function inMathFence(doc: Text, pos: number): boolean {
  let open = false
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    if (pos >= line.from && pos <= line.to) {
      if (isMathDelimiterLine(line.text)) return false
      return open
    }
    if (isMathDelimiterLine(line.text)) open = !open
  }
  return false
}

function findImageInLine(lineText: string, lineFrom: number, pos: number) {
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(lineText))) {
    const from = lineFrom + m.index
    const to = from + m[0].length
    if (pos >= from && pos <= to) return { alt: m[1], url: m[2], range: { from, to } }
  }
  return null
}

function findLinkInLine(lineText: string, lineFrom: number, pos: number) {
  const re = /\[([^\]]*)\]\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(lineText))) {
    if (m.index > 0 && lineText[m.index - 1] === '!') continue
    const from = lineFrom + m.index
    const to = from + m[0].length
    if (pos >= from && pos <= to) return { text: m[1], url: m[2], range: { from, to } }
  }
  return null
}

export function detectCodeMirrorContext(doc: Text, pos: number): CMHit {
  if (inCodeFence(doc, pos)) return { kind: 'code-block' }
  if (inMathFence(doc, pos)) return { kind: 'math-block' }

  const line = doc.lineAt(pos)
  const lt = line.text

  const img = findImageInLine(lt, line.from, pos)
  if (img) return { kind: 'image', url: img.url, range: img.range }

  const lk = findLinkInLine(lt, line.from, pos)
  if (lk) return { kind: 'link', url: lk.url, linkText: lk.text, range: lk.range }

  const parsed = parseMarkdownTableAt(doc, pos)
  if (parsed) {
    return {
      kind: 'table',
      tableBlockRange: { from: parsed.from, to: parsed.to },
      markdownTable: parsed,
    }
  }

  const ltPipe = lt.trim()
  if (lt.includes('|') && /^\s*\|/.test(ltPipe)) return { kind: 'table' }

  const body = lt.trimStart()
  if (/^#{1,6}\s/.test(body)) {
    const level = body.match(/^#+/)![0].length
    return { kind: 'heading', headingLevel: level }
  }
  if (/^-\s\[[ x]\]\s/i.test(body)) return { kind: 'task-list' }
  if (/^[-*+]\s/.test(body) || /^\d+\.\s/.test(body)) return { kind: 'list' }
  if (/^>\s/.test(body)) return { kind: 'blockquote' }
  return { kind: 'paragraph' }
}

function findFenceBlockRange(doc: Text, pos: number): { from: number; to: number } | null {
  let ln = doc.lineAt(pos).number
  while (ln >= 1 && !isFenceDelimiterLine(doc.line(ln).text)) ln--
  if (ln < 1 || !isFenceDelimiterLine(doc.line(ln).text)) return null
  const startLine = ln
  let endLine = startLine + 1
  while (endLine <= doc.lines && !isFenceDelimiterLine(doc.line(endLine).text)) endLine++
  if (endLine > doc.lines || !isFenceDelimiterLine(doc.line(endLine).text)) return null
  const from = doc.line(startLine).from
  const to = doc.line(endLine).to
  const after = to < doc.length ? doc.sliceString(to, to + 1) : ''
  const extend = after === '\n' ? 1 : 0
  return { from, to: to + extend }
}

function deleteCmCodeFence(view: CMEditorView, semanticPos: number) {
  const range = findFenceBlockRange(view.state.doc, semanticPos)
  if (!range) return
  view.dispatch({ changes: { from: range.from, to: range.to, insert: '' } })
  view.focus()
}

function copyCmFenceInner(view: CMEditorView, semanticPos: number): string {
  const doc = view.state.doc
  let ln = doc.lineAt(semanticPos).number
  while (ln >= 1 && !isFenceDelimiterLine(doc.line(ln).text)) ln--
  if (ln < 1 || !isFenceDelimiterLine(doc.line(ln).text)) return ''
  const startBody = ln + 1
  let endBody = startBody
  while (endBody <= doc.lines && !isFenceDelimiterLine(doc.line(endBody).text)) endBody++
  if (endBody > doc.lines) return ''
  const from = doc.line(startBody).from
  const to = doc.line(endBody - 1).to
  return doc.sliceString(from, to)
}

function linkAttrsAt(state: EditorState, pos: number): { href: string } | null {
  const link = state.schema.marks.link
  if (!link) return null
  const $pos = state.doc.resolve(pos)
  const marks = $pos.marks()
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i]
    if (m.type === link && typeof m.attrs.href === 'string') return { href: m.attrs.href as string }
  }
  return null
}

function resolvePmTableRange(state: EditorState, pos: number): { from: number; to: number } | null {
  const $pos = state.doc.resolve(pos)
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === 'table') {
      return { from: $pos.before(d), to: $pos.after(d) }
    }
  }
  return null
}

function resolvePmCodeBlockRange(state: EditorState, pos: number): { from: number; to: number } | null {
  const $pos = state.doc.resolve(pos)
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === 'code_block') {
      return { from: $pos.before(d), to: $pos.after(d) }
    }
  }
  return null
}

function resolvePmImageRange(view: PMEditorView, pos: number): { from: number; to: number; src?: string } | null {
  const state = view.state
  const imageType = state.schema.nodes.image
  if (!imageType) return null
  const $pos = state.doc.resolve(pos)
  const after = $pos.nodeAfter
  if (after?.type === imageType) {
    return { from: pos, to: pos + after.nodeSize, src: after.attrs?.src as string | undefined }
  }
  const before = $pos.nodeBefore
  if (before?.type === imageType) {
    return { from: pos - before.nodeSize, to: pos, src: before.attrs?.src as string | undefined }
  }
  for (let d = $pos.depth; d > 0; d--) {
    const n = $pos.node(d)
    if (n.type === imageType) {
      return { from: $pos.before(d), to: $pos.after(d), src: n.attrs?.src as string | undefined }
    }
  }
  return null
}

function expandPmLinkMarkRange(state: EditorState, pos: number): { from: number; to: number } | null {
  const link = state.schema.marks.link
  if (!link) return null
  const $pos = state.doc.resolve(pos)
  if (!link.isInSet($pos.marks())) return null
  let start = pos
  let end = pos
  while (start > 0) {
    if (!link.isInSet(state.doc.resolve(start - 1).marks())) break
    start--
  }
  while (end < state.doc.content.size) {
    if (!link.isInSet(state.doc.resolve(end).marks())) break
    end++
  }
  return { from: start, to: end }
}

interface PmMenuTargets {
  linkRange: { from: number; to: number } | null
  tableRange: { from: number; to: number } | null
  codeRange: { from: number; to: number } | null
  imageRange: { from: number; to: number; src?: string } | null
}

function buildPmMenuTargets(view: PMEditorView, clientX: number, clientY: number, domTarget: EventTarget | null): PmMenuTargets {
  const coords = view.posAtCoords({ left: clientX, top: clientY })
  let pos = coords?.pos ?? view.state.selection.from

  if (domTarget instanceof HTMLImageElement) {
    try {
      pos = view.posAtDOM(domTarget, 0)
    } catch {
      /* ignore */
    }
  }

  const state = view.state
  return {
    linkRange: expandPmLinkMarkRange(state, pos),
    tableRange: resolvePmTableRange(state, pos),
    codeRange: resolvePmCodeBlockRange(state, pos),
    imageRange: resolvePmImageRange(view, pos),
  }
}

function findPmAncestor(state: EditorState, pos: number, names: string[]): number | null {
  const $pos = state.doc.resolve(pos)
  for (let d = $pos.depth; d > 0; d--) {
    if (names.includes($pos.node(d).type.name)) return d
  }
  return null
}

export function detectWysiwygContext(
  view: PMEditorView,
  clientX: number,
  clientY: number,
  domTarget?: EventTarget | null,
): PMHit {
  const coords = view.posAtCoords({ left: clientX, top: clientY })
  if (coords == null) return { kind: 'paragraph' }
  let pos = coords.pos

  if (domTarget instanceof HTMLImageElement) {
    try {
      pos = view.posAtDOM(domTarget, 0)
    } catch {
      /* ignore */
    }
  }

  if (resolvePmImageRange(view, pos)) return { kind: 'image' }

  const state = view.state
  const $pos = state.doc.resolve(pos)

  for (let d = $pos.depth; d > 0; d--) {
    const n = $pos.node(d)
    const name = n.type.name
    if (name === 'code_block') return { kind: 'code-block' }
    if (name === 'table') return { kind: 'table' }
    if (name.includes('table') && (name.includes('cell') || name.includes('header'))) return { kind: 'table' }
  }

  const tableDepth = findPmAncestor(state, pos, ['table'])
  if (tableDepth != null) return { kind: 'table' }

  const liDepth = findPmAncestor(state, pos, ['list_item'])
  if (liDepth != null) {
    const node = state.doc.resolve(pos).node(liDepth)
    if (node.attrs && node.attrs.checked != null) return { kind: 'task-list' }
    return { kind: 'list' }
  }

  if (findPmAncestor(state, pos, ['blockquote']) != null) return { kind: 'blockquote' }
  if (findPmAncestor(state, pos, ['heading']) != null) return { kind: 'heading' }

  const href = linkAttrsAt(state, pos)
  if (href) return { kind: 'link', href: href.href }

  return { kind: 'paragraph' }
}

function buildParagraphSubmenu(mode: 'source' | 'wysiwyg'): ContextMenuEntry[] {
  const editorStore = useEditorStore()
  const rows: ContextMenuEntry[] = [
    { id: 'para-p', label: '段落', action: () => editorStore.requestFormat('paragraph') },
    ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
      id: `para-h${level}`,
      label: `标题 ${level}`,
      action: () => editorStore.requestHeading(level),
    })),
    {
      id: 'para-ph',
      label: '提升标题级别',
      separatorBefore: true,
      action: () => editorStore.requestFormat('promote-heading'),
    },
    { id: 'para-dh', label: '降低标题级别', action: () => editorStore.requestFormat('demote-heading') },
  ]
  if (mode === 'wysiwyg') {
    return rows.filter((r) => {
      if (r.id === 'para-p') return isWysiwygFormatCommandSupported('paragraph')
      if (r.id.startsWith('para-h')) return true
      if (r.id === 'para-ph') return isWysiwygFormatCommandSupported('promote-heading')
      if (r.id === 'para-dh') return isWysiwygFormatCommandSupported('demote-heading')
      return true
    })
  }
  return rows
}

function buildListSubmenu(mode: 'source' | 'wysiwyg'): ContextMenuEntry[] {
  const editorStore = useEditorStore()
  const rows: ContextMenuEntry[] = [
    { id: 'li-ul', label: '无序列表', action: () => editorStore.requestFormat('unordered-list') },
    { id: 'li-ol', label: '有序列表', action: () => editorStore.requestFormat('ordered-list') },
    { id: 'li-task', label: '任务列表', action: () => editorStore.requestFormat('task-list') },
  ]
  if (mode === 'wysiwyg') {
    return rows.filter((r) => isWysiwygFormatCommandSupported(r.id === 'li-ul' ? 'unordered-list' : r.id === 'li-ol' ? 'ordered-list' : 'task-list'))
  }
  return rows
}

function buildInsertSubmenu(mode: 'source' | 'wysiwyg'): ContextMenuEntry[] {
  const editorStore = useEditorStore()
  const candidates: { id: string; label: string; cmd?: string; table?: boolean }[] = [
    { id: 'ins-img', label: '图片', cmd: 'image' },
    { id: 'ins-link', label: '链接', cmd: 'hyperlink' },
    { id: 'ins-tbl', label: '表格', table: true },
    { id: 'ins-hr', label: '分割线', cmd: 'horizontal-rule' },
    { id: 'ins-toc', label: 'TOC 标记', cmd: 'toc' },
    { id: 'ins-yaml', label: 'YAML Front Matter', cmd: 'yaml-front-matter' },
    { id: 'ins-code', label: '代码块', cmd: 'code-block' },
    { id: 'ins-math', label: '公式块', cmd: 'math-block' },
    { id: 'ins-quote', label: '引用', cmd: 'blockquote' },
  ]
  return candidates
    .filter((c) => {
      if (mode === 'source') return true
      if (c.table) return isWysiwygFormatCommandSupported('table')
      return c.cmd ? isWysiwygFormatCommandSupported(c.cmd) : true
    })
    .map((c) => ({
      id: c.id,
      label: c.label,
      action: () => {
        if (c.table) dispatchAppCommand({ type: 'format', command: 'table' })
        else if (c.cmd) editorStore.requestFormat(c.cmd)
      },
    }))
}

function cmSpecialItems(view: CMEditorView, hit: CMHit, semanticPos: number): ContextMenuEntry[] {
  const editorStore = useEditorStore()
  const out: ContextMenuEntry[] = []

  if (hit.kind === 'link' && hit.url && hit.range) {
    const url = hit.url
    out.push(
      {
        id: 'cm-open-link',
        label: '打开链接',
        disabled: !url.startsWith('https://'),
        action: async () => {
          if (url.startsWith('https://')) await window.electronAPI?.openExternal(url)
        },
      },
      {
        id: 'cm-copy-link',
        label: '复制链接地址',
        action: async () => {
          try {
            await navigator.clipboard.writeText(url)
          } catch {
            /* ignore */
          }
        },
      },
      {
        id: 'cm-edit-link',
        label: '编辑链接',
        action: () => {
          const text = hit.linkText ?? ''
          const range = hit.range!
          const next = typeof window !== 'undefined' ? window.prompt('链接地址', url) : null
          if (next === null) return
          const normalized = next.trim()
          if (!normalized) {
            editorStore.showStatusToast('链接地址不能为空')
            return
          }
          const insert = `[${text}](${normalized})`
          view.dispatch({ changes: { from: range.from, to: range.to, insert } })
          view.focus()
        },
      },
      {
        id: 'cm-unlink',
        label: '取消链接',
        action: () => {
          const t = hit.linkText ?? ''
          view.dispatch({ changes: { from: hit.range!.from, to: hit.range!.to, insert: t } })
          view.focus()
        },
      },
    )
  }

  if (hit.kind === 'image' && hit.url && hit.range) {
    const url = hit.url
    out.push(
      {
        id: 'cm-copy-img-path',
        label: '复制图片路径',
        action: async () => {
          try {
            await navigator.clipboard.writeText(url)
          } catch {
            /* ignore */
          }
        },
      },
      {
        id: 'cm-del-img',
        label: '删除图片引用',
        danger: true,
        action: () => {
          view.dispatch({ changes: { from: hit.range!.from, to: hit.range!.to, insert: '' } })
          view.focus()
        },
      },
    )
  }

  if (hit.kind === 'code-block') {
    out.push(
      {
        id: 'cm-copy-code',
        label: '复制代码',
        action: async () => {
          const inner = copyCmFenceInner(view, semanticPos)
          const text = inner || view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
          try {
            await navigator.clipboard.writeText(text)
          } catch {
            /* ignore */
          }
        },
      },
      {
        id: 'cm-del-code',
        label: '删除代码块',
        danger: true,
        action: () => deleteCmCodeFence(view, semanticPos),
      },
    )
  }

  if (hit.kind === 'math-block') {
    out.push({
      id: 'cm-copy-math',
      label: '复制公式源码',
      action: async () => {
        const sel = view.state.selection.main
        const slice = view.state.sliceDoc(sel.from, sel.to)
        try {
          await navigator.clipboard.writeText(slice || view.state.doc.lineAt(semanticPos).text)
        } catch {
          /* ignore */
        }
      },
    })
  }

  if (hit.kind === 'table') {
    out.push({
      id: 'cm-open-te',
      label: '打开表格编辑器',
      action: () => dispatchAppCommand({ type: 'format', command: 'table' }),
    })
    const tbl = hit.markdownTable
    const range = hit.tableBlockRange
    if (tbl && range) {
      const doc = view.state.doc
      const ln = doc.lineAt(semanticPos).number
      let phy = physicalRowIndex(tbl, ln)
      if (phy < 0) phy = 2

      const replaceTable = (next: MarkdownTableBlock | null) => {
        if (!next) return
        const insert = serializeMarkdownTable(next) + (tbl.trailingNewline ? '\n' : '')
        view.dispatch({
          changes: { from: tbl.from, to: tbl.to, insert },
        })
        view.focus()
      }

      const cc = tbl.currentCell
      const colIdx = cc?.columnIndex ?? 0

      out.push(
        {
          id: 'cm-row-ins-above',
          label: '插入行到上方',
          separatorBefore: true,
          action: () => replaceTable(insertRowAbove(tbl, phy)),
        },
        {
          id: 'cm-row-ins-below',
          label: '插入行到下方',
          action: () => replaceTable(insertRowBelow(tbl, phy)),
        },
        {
          id: 'cm-col-ins-left',
          label: '插入列到左侧',
          separatorBefore: true,
          action: () => replaceTable(insertColumnLeft(tbl, colIdx)),
        },
        {
          id: 'cm-col-ins-right',
          label: '插入列到右侧',
          action: () => replaceTable(insertColumnRight(tbl, colIdx)),
        },
        {
          id: 'cm-row-del',
          label: '删除当前行',
          danger: true,
          disabled: phy < 2,
          action: () => replaceTable(deleteBodyRow(tbl, phy)),
        },
        {
          id: 'cm-col-del',
          label: '删除当前列',
          danger: true,
          disabled: tbl.columnCount <= 1,
          action: () => replaceTable(deleteColumn(tbl, colIdx)),
        },
        {
          id: 'cm-del-table',
          label: '删除表格',
          danger: true,
          action: () => {
            view.dispatch({ changes: { from: range.from, to: range.to, insert: '' } })
            view.focus()
          },
        },
        {
          id: 'cm-sub-align',
          label: '对齐方式',
          separatorBefore: true,
          children: (
            [
              ['cm-al-def', '默认对齐', 'default'],
              ['cm-al-left', '左对齐', 'left'],
              ['cm-al-center', '居中对齐', 'center'],
              ['cm-al-right', '右对齐', 'right'],
            ] as const
          ).map(([id, label, value]) => {
            const cur = tbl.alignments[colIdx] ?? 'default'
            return {
              id,
              label: cur === value ? `${label}（当前）` : label,
              action: () => replaceTable(setColumnAlignment(tbl, colIdx, value)),
            }
          }),
        },
      )
    }
  }

  return out
}

function pmSpecialItems(
  hit: PMHit,
  targets: PmMenuTargets,
  pmView?: PMEditorView,
  pmClickPos?: number | null,
): ContextMenuEntry[] {
  const editorStore = useEditorStore()
  const out: ContextMenuEntry[] = []

  if (hit.kind === 'link' && hit.href) {
    const href = hit.href
    const lr = targets.linkRange
    out.push(
      {
        id: 'pm-open-link',
        label: '打开链接',
        disabled: !href.startsWith('https://'),
        action: async () => {
          if (href.startsWith('https://')) await window.electronAPI?.openExternal(href)
        },
      },
      {
        id: 'pm-copy-link',
        label: '复制链接地址',
        action: async () => {
          try {
            await navigator.clipboard.writeText(href)
          } catch {
            /* ignore */
          }
        },
      },
      {
        id: 'pm-edit-link',
        label: '编辑链接',
        disabled: !lr,
        action: () => {
          if (!lr) return
          editorStore.requestFormat('edit-hyperlink', undefined, lr)
        },
      },
      {
        id: 'pm-unlink',
        label: '取消链接',
        disabled: !lr,
        action: () => {
          if (!lr) return
          editorStore.requestFormat('unlink-hyperlink', undefined, lr)
        },
      },
    )
  }

  if (hit.kind === 'image' && targets.imageRange) {
    const ir = targets.imageRange
    out.push(
      {
        id: 'pm-copy-img-src',
        label: '复制图片路径',
        disabled: !ir.src,
        action: async () => {
          if (!ir.src) return
          try {
            await navigator.clipboard.writeText(ir.src)
          } catch {
            /* ignore */
          }
        },
      },
      {
        id: 'pm-del-img',
        label: '删除图片',
        danger: true,
        action: () => editorStore.requestFormat('delete-image', undefined, { from: ir.from, to: ir.to }),
      },
    )
  }

  if (hit.kind === 'code-block') {
    out.push(
      {
        id: 'pm-copy-code',
        label: '复制代码',
        action: async () => {
          try {
            const t = window.getSelection()?.toString() ?? ''
            await navigator.clipboard.writeText(t)
          } catch {
            /* ignore */
          }
        },
      },
    )
    if (targets.codeRange) {
      const cr = targets.codeRange
      out.push({
        id: 'pm-del-code',
        label: '删除代码块',
        danger: true,
        action: () => editorStore.requestFormat('delete-code-block', undefined, cr),
      })
    }
  }

  if (hit.kind === 'table') {
    out.push({
      id: 'pm-open-te',
      label: '打开表格编辑器',
      action: () => dispatchAppCommand({ type: 'format', command: 'table' }),
    })

    const pmTarget =
      pmView != null && pmClickPos != null ? resolvePmTableTarget(pmView.state, pmClickPos) : null

    const alignToast =
      '当前 WYSIWYG 表格结构暂不支持直接设置列对齐，请切换源码模式或使用表格编辑器。'

    const alignChildren = (
      [
        ['pm-al-def', '默认对齐', 'table-align-default'],
        ['pm-al-left', '左对齐', 'table-align-left'],
        ['pm-al-center', '居中对齐', 'table-align-center'],
        ['pm-al-right', '右对齐', 'table-align-right'],
      ] as const
    ).map(([id, label, cmd]) => ({
      id,
      label,
      action: () => {
        if (!pmTarget || !pmView) return
        const can = pmTableSupportsColumnAlignment(pmView.state, pmTarget)
        if (!can) {
          editorStore.showStatusToast(alignToast)
          return
        }
        editorStore.requestFormat(cmd)
      },
    }))

    if (pmTarget && pmView) {
      const trTable = { from: pmTarget.tableFrom, to: pmTarget.tableTo }
      const rowDelDisabled = pmTarget.rowIndex === 0
      const colDelDisabled = pmTarget.columnCount <= 1

      out.push(
        {
          id: 'pm-row-ins-above',
          label: '插入行到上方',
          separatorBefore: true,
          action: () => editorStore.requestFormat('table-row-insert-above'),
        },
        {
          id: 'pm-row-ins-below',
          label: '插入行到下方',
          action: () => editorStore.requestFormat('table-row-insert-below'),
        },
        {
          id: 'pm-col-ins-left',
          label: '插入列到左侧',
          separatorBefore: true,
          action: () => editorStore.requestFormat('table-column-insert-left'),
        },
        {
          id: 'pm-col-ins-right',
          label: '插入列到右侧',
          action: () => editorStore.requestFormat('table-column-insert-right'),
        },
        {
          id: 'pm-row-del',
          label: '删除当前行',
          danger: true,
          disabled: rowDelDisabled,
          action: () => editorStore.requestFormat('table-row-delete'),
        },
        {
          id: 'pm-col-del',
          label: '删除当前列',
          danger: true,
          disabled: colDelDisabled,
          action: () => editorStore.requestFormat('table-column-delete'),
        },
        {
          id: 'pm-del-table',
          label: '删除表格',
          danger: true,
          action: () => editorStore.requestFormat('delete-table', undefined, trTable),
        },
        {
          id: 'pm-sub-align',
          label: '对齐方式',
          separatorBefore: true,
          children: alignChildren,
        },
      )
    } else if (targets.tableRange) {
      const tr = targets.tableRange
      out.push({
        id: 'pm-del-table',
        label: '删除表格',
        danger: true,
        separatorBefore: true,
        action: () => editorStore.requestFormat('delete-table', undefined, tr),
      })
    }
  }

  if (hit.kind === 'task-list') {
    out.push({
      id: 'pm-toggle-task',
      label: '切换完成状态',
      action: () => editorStore.requestFormat('task-list'),
    })
  }

  return out
}

export function buildTyporaCodeMirrorMenu(view: CMEditorView, semanticPos: number): ContextMenuEntry[] {
  const editorStore = useEditorStore()
  const hit = detectCodeMirrorContext(view.state.doc, semanticPos)
  const hasSel = !view.state.selection.main.empty

  const prefix = cmSpecialItems(view, hit, semanticPos)
  const clip = buildCodeMirrorTextMenu(view)

  const formats: ContextMenuEntry[] = [
    {
      id: 'fmt-bold',
      label: '加粗',
      disabled: !hasSel,
      separatorBefore: true,
      action: () => editorStore.requestFormat('bold'),
    },
    {
      id: 'fmt-italic',
      label: '斜体',
      disabled: !hasSel,
      action: () => editorStore.requestFormat('italic'),
    },
    {
      id: 'fmt-strike',
      label: '删除线',
      disabled: !hasSel,
      action: () => editorStore.requestFormat('strikethrough'),
    },
    {
      id: 'fmt-code',
      label: '行内代码',
      disabled: !hasSel,
      action: () => editorStore.requestFormat('code'),
    },
    {
      id: 'fmt-link',
      label: '超链接',
      action: () => editorStore.requestFormat('hyperlink'),
    },
  ]

  const structural: ContextMenuEntry[] = [
    {
      id: 'sub-paragraph',
      label: '段落',
      children: buildParagraphSubmenu('source'),
    },
    {
      id: 'sub-list',
      label: '列表',
      children: buildListSubmenu('source'),
    },
    {
      id: 'sub-insert',
      label: '插入',
      children: buildInsertSubmenu('source'),
    },
  ]

  const tail: ContextMenuEntry[] = [
    {
      id: 'fmt-clear',
      label: '清除样式',
      separatorBefore: true,
      disabled: !hasSel,
      action: () => editorStore.requestFormat('clear-format'),
    },
  ]

  const clipHead = clip.slice(0, 4).map((row, i) =>
    i === 0 && prefix.length ? { ...row, separatorBefore: true } : row,
  )
  return [...prefix, ...clipHead, ...formats, ...structural, ...tail, clip[clip.length - 1]]
}

export function buildTyporaWysiwygMenu(
  pmView: PMEditorView,
  pmRoot: HTMLElement,
  event: MouseEvent,
): ContextMenuEntry[] {
  const editorStore = useEditorStore()
  const targets = buildPmMenuTargets(pmView, event.clientX, event.clientY, event.target)
  const hit = detectWysiwygContext(pmView, event.clientX, event.clientY, event.target)
  const hasSel = !pmView.state.selection.empty

  const coords = pmView.posAtCoords({ left: event.clientX, top: event.clientY })
  const pmClickPos = coords?.pos ?? null
  const prefix = pmSpecialItems(hit, targets, pmView, pmClickPos)
  const clip = buildWysiwygTextMenu(pmRoot, event)

  const fmt = (id: string, label: string, cmd: string): ContextMenuEntry => ({
    id,
    label,
    disabled: !hasSel || !isWysiwygFormatCommandSupported(cmd),
    action: () => editorStore.requestFormat(cmd),
  })

  const formats: ContextMenuEntry[] = [
    {
      ...fmt('w-bold', '加粗', 'bold'),
      separatorBefore: true,
    },
    fmt('w-italic', '斜体', 'italic'),
    fmt('w-strike', '删除线', 'strikethrough'),
    fmt('w-code', '行内代码', 'code'),
    {
      id: 'w-link',
      label: '超链接',
      disabled: !isWysiwygFormatCommandSupported('hyperlink'),
      action: () => editorStore.requestFormat('hyperlink'),
    },
  ]

  const paragraphKids = buildParagraphSubmenu('wysiwyg')
  const listKids = buildListSubmenu('wysiwyg')
  const insertKids = buildInsertSubmenu('wysiwyg')

  const structural: ContextMenuEntry[] = []
  if (paragraphKids.length) {
    structural.push({ id: 'w-sub-p', label: '段落', children: paragraphKids })
  }
  if (listKids.length) {
    structural.push({ id: 'w-sub-l', label: '列表', children: listKids })
  }
  if (insertKids.length) {
    structural.push({ id: 'w-sub-i', label: '插入', children: insertKids })
  }

  const tail: ContextMenuEntry[] = [
    {
      id: 'w-clear',
      label: '清除样式',
      separatorBefore: true,
      disabled: !hasSel || !isWysiwygFormatCommandSupported('clear-format'),
      action: () => editorStore.requestFormat('clear-format'),
    },
  ]

  const clipHead = clip.slice(0, 4).map((row, i) =>
    i === 0 && prefix.length ? { ...row, separatorBefore: true } : row,
  )
  return [...prefix, ...clipHead, ...formats, ...structural, ...tail, clip[clip.length - 1]]
}
