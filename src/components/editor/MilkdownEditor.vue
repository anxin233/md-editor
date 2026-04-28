<script setup lang="ts">
import { watch } from 'vue'
import { useEditor, useInstance } from '@milkdown/vue'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, commandsCtx } from '@milkdown/core'
import type { Node as ProseNode, NodeType, ResolvedPos } from '@milkdown/prose/model'
import { lift } from '@milkdown/prose/commands'
import { liftListItem } from '@milkdown/prose/schema-list'
import { TextSelection, EditorState } from '@milkdown/prose/state'
import { replaceAll, $markSchema, $remark } from '@milkdown/utils'
import {
  commonmark,
  toggleLinkCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  insertImageCommand,
} from '@milkdown/preset-commonmark'
import { gfm, toggleStrikethroughCommand } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { indent } from '@milkdown/plugin-indent'
import { trailing } from '@milkdown/plugin-trailing'
import { Milkdown } from '@milkdown/vue'
import { useEditorStore } from '@/stores/editor'

const editorStore = useEditorStore()

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

let isInternalUpdate = false
let lastEmittedValue = ''

function transformUnderlineTags(node: any) {
  if (!node.children) return
  const newChildren: any[] = []
  let i = 0
  while (i < node.children.length) {
    const child = node.children[i]
    if (child.type === 'html' && child.value === '<u>') {
      let j = i + 1
      while (j < node.children.length) {
        if (node.children[j].type === 'html' && node.children[j].value === '</u>') break
        j++
      }
      if (j < node.children.length) {
        const inner = node.children.slice(i + 1, j)
        inner.forEach((c: any) => transformUnderlineTags(c))
        newChildren.push({ type: 'underline', children: inner })
        i = j + 1
      } else {
        transformUnderlineTags(child)
        newChildren.push(child)
        i++
      }
    } else {
      transformUnderlineTags(child)
      newChildren.push(child)
      i++
    }
  }
  node.children = newChildren
}

const remarkUnderlinePlugin = $remark('remarkUnderline', () =>
  function (this: any) {
    const data = this.data() as Record<string, any[]>
    const ext = data['toMarkdownExtensions'] || (data['toMarkdownExtensions'] = [])
    ext.push({
      handlers: {
        underline(node: any, _parent: any, state: any, info: any) {
          const exit = state.enter('underline')
          const value = state.containerPhrasing(node, {
            before: info.before,
            after: info.after,
          })
          exit()
          return `<u>${value}</u>`
        },
      },
    })
    return (tree: any) => transformUnderlineTags(tree)
  }
)

const underlineSchema = $markSchema('underline', () => ({
  parseDOM: [{ tag: 'u' }],
  toDOM: () => ['u', 0] as const,
  parseMarkdown: {
    match: (node: any) => node.type === 'underline',
    runner: (state: any, node: any, markType: any) => {
      state.openMark(markType)
      state.next(node.children)
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark: any) => mark.type.name === 'underline',
    runner: (state: any, mark: any) => {
      state.withMark(mark, 'underline')
    },
  },
}))

useEditor((root) => {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, props.modelValue)
      lastEmittedValue = props.modelValue
      ctx.get(listenerCtx)
        .markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (markdown !== prevMarkdown) {
            isInternalUpdate = true
            lastEmittedValue = markdown
            emit('update:modelValue', markdown)
            isInternalUpdate = false
          }
        })
    })
    .use(commonmark)
    .use(gfm)
    .use(remarkUnderlinePlugin)
    .use(underlineSchema)
    .use(history)
    .use(listener)
    .use(indent)
    .use(trailing)

  return editor
})

const [loading, getEditor] = useInstance()

watch(() => props.modelValue, (newVal) => {
  if (isInternalUpdate) return
  if (newVal === lastEmittedValue) return
  if (loading.value) return

  const editor = getEditor()
  if (editor) {
    try {
      editor.action(replaceAll(newVal))
      lastEmittedValue = newVal
    } catch {
      // editor might not be ready
    }
  }
})

function setHeading(level: number) {
  const editor = getEditor()
  if (!editor || loading.value) return

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const { schema, selection } = state
    const { $from, $to } = selection

    const headingType = schema.nodes.heading
    const paragraphType = schema.nodes.paragraph
    if (!headingType || !paragraphType) return

    const isSameHeading = $from.parent.type === headingType
      && $from.parent.attrs.level === level

    const tr = state.tr
    tr.setBlockType(
      $from.pos,
      $to.pos,
      isSameHeading ? paragraphType : headingType,
      isSameHeading ? undefined : { level }
    )
    dispatch(tr)
    view.focus()
  })
}

function toggleMark(markName: string) {
  const editor = getEditor()
  if (!editor || loading.value) return

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const markType = state.schema.marks[markName]
    if (!markType) return

    const { from, to, empty } = state.selection
    if (empty) {
      const storedMarks = state.storedMarks || state.selection.$from.marks()
      if (markType.isInSet(storedMarks)) {
        dispatch(state.tr.removeStoredMark(markType))
      } else {
        dispatch(state.tr.addStoredMark(markType.create()))
      }
    } else {
      if (state.doc.rangeHasMark(from, to, markType)) {
        dispatch(state.tr.removeMark(from, to, markType))
      } else {
        dispatch(state.tr.addMark(from, to, markType.create()))
      }
    }
    view.focus()
  })
}

function toggleStrikethrough() {
  const editor = getEditor()
  if (!editor || loading.value) return

  editor.action((ctx) => {
    const commands = ctx.get(commandsCtx)
    commands.call(toggleStrikethroughCommand.key)
  })
}

function setParagraph() {
  const editor = getEditor()
  if (!editor || loading.value) return

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const paragraphType = state.schema.nodes.paragraph
    if (!paragraphType) return
    const { $from, $to } = state.selection
    dispatch(state.tr.setBlockType($from.pos, $to.pos, paragraphType))
    view.focus()
  })
}

function promoteHeading() {
  const editor = getEditor()
  if (!editor || loading.value) return

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const { schema, selection } = state
    const { $from, $to } = selection
    const headingType = schema.nodes.heading
    const paragraphType = schema.nodes.paragraph
    if (!headingType || !paragraphType) return

    if ($from.parent.type === headingType) {
      const level = $from.parent.attrs.level
      if (level > 1) {
        dispatch(state.tr.setBlockType($from.pos, $to.pos, headingType, { level: level - 1 }))
      }
    } else {
      dispatch(state.tr.setBlockType($from.pos, $to.pos, headingType, { level: 6 }))
    }
    view.focus()
  })
}

function demoteHeading() {
  const editor = getEditor()
  if (!editor || loading.value) return

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const { schema, selection } = state
    const { $from, $to } = selection
    const headingType = schema.nodes.heading
    const paragraphType = schema.nodes.paragraph
    if (!headingType || !paragraphType) return

    if ($from.parent.type === headingType) {
      const level = $from.parent.attrs.level
      if (level < 6) {
        dispatch(state.tr.setBlockType($from.pos, $to.pos, headingType, { level: level + 1 }))
      } else {
        dispatch(state.tr.setBlockType($from.pos, $to.pos, paragraphType))
      }
    }
    view.focus()
  })
}

function clearAllMarks() {
  const editor = getEditor()
  if (!editor || loading.value) return

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const { from, to } = state.selection
    if (from === to) return
    const tr = state.tr
    for (const markName of Object.keys(state.schema.marks)) {
      tr.removeMark(from, to, state.schema.marks[markName])
    }
    dispatch(tr)
    view.focus()
  })
}

function appendMarkdownBlock(markdown: string) {
  const normalized = props.modelValue.replace(/\s*$/, '')
  const nextValue = normalized ? `${normalized}\n\n${markdown}\n` : `${markdown}\n`
  emit('update:modelValue', nextValue)
}

function createParagraphNode(paragraphType: NodeType, text = '') {
  const textNode = text ? paragraphType.schema.text(text) : null
  return paragraphType.createAndFill(null, textNode ? [textNode] : undefined)
}

function applyPreciseBlockInsert(
  state: any,
  dispatch: (tr: any) => void,
  paragraphType: NodeType | undefined,
  insertedNodes: ProseNode[],
  cursorOffset: number,
  trailingParagraph?: ProseNode | null,
) {
  const trailingNode = trailingParagraph ?? paragraphType?.createAndFill() ?? null
  const { $from, $to } = state.selection

  if (paragraphType && $from.sameParent($to) && $from.parent.type === paragraphType) {
    const currentParagraph = $from.parent
    const beforeContent = currentParagraph.content.cut(0, $from.parentOffset)
    const afterContent = currentParagraph.content.cut($to.parentOffset, currentParagraph.content.size)

    const beforeParagraph = beforeContent.size > 0
      ? paragraphType.createAndFill(currentParagraph.attrs, beforeContent)
      : null
    const afterParagraph = afterContent.size > 0
      ? paragraphType.createAndFill(currentParagraph.attrs, afterContent)
      : trailingNode

    if ((beforeContent.size === 0 || beforeParagraph) && afterParagraph) {
      const replacementNodes = [
        ...(beforeParagraph ? [beforeParagraph] : []),
        ...insertedNodes,
        afterParagraph,
      ]

      const replacementStart = $from.before($from.depth)
      const cursorPos = replacementStart + (beforeParagraph?.nodeSize || 0) + cursorOffset
      const tr = state.tr.replaceWith(replacementStart, $from.after($from.depth), replacementNodes)
      tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)))
      dispatch(tr.scrollIntoView())
      return true
    }
  }

  const insertPos = state.selection.$from.depth >= 1
    ? state.selection.$from.after(1)
    : state.doc.content.size
  const nodesToInsert = trailingNode ? [...insertedNodes, trailingNode] : insertedNodes
  const tr = state.tr.replaceWith(insertPos, insertPos, nodesToInsert)
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + cursorOffset)))
  dispatch(tr.scrollIntoView())
  return true
}

function parseTableMarkdown(markdown: string) {
  const lines = markdown
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length < 2) return null

  const parseRow = (line: string) => {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
    return trimmed.split('|').map(cell => cell.trim())
  }

  const parseAlignment = (line: string) => {
    return parseRow(line).map((cell) => {
      const trimmed = cell.replace(/\s/g, '')
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center'
      if (trimmed.endsWith(':')) return 'right'
      return 'left'
    })
  }

  const headers = parseRow(lines[0])
  const alignments = parseAlignment(lines[1])
  const bodyRows = lines.slice(2).map(parseRow)
  return { headers, alignments, bodyRows }
}

function insertTableBlock(markdown: string) {
  const editor = getEditor()
  if (!editor || loading.value) {
    appendMarkdownBlock(markdown)
    return
  }

  const parsed = parseTableMarkdown(markdown)
  if (!parsed) {
    appendMarkdownBlock(markdown)
    return
  }

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const { schema } = state

    const tableType = schema.nodes.table
    const headerRowType = schema.nodes.table_header_row || schema.nodes.tableHeaderRow
    const rowType = schema.nodes.table_row || schema.nodes.tableRow
    const headerCellType = schema.nodes.table_header || schema.nodes.tableHeader || schema.nodes.table_cell || schema.nodes.tableCell
    const cellType = schema.nodes.table_cell || schema.nodes.tableCell || headerCellType
    const paragraphType = schema.nodes.paragraph

    if (!tableType || !headerRowType || !rowType || !headerCellType || !cellType) {
      appendMarkdownBlock(markdown)
      return
    }

    const createCell = (type: typeof headerCellType, text: string, alignment = 'left') => {
      const textNode = text ? schema.text(text) : null

      if (paragraphType) {
        return type.createAndFill(
          { alignment },
          paragraphType.create(null, textNode ? [textNode] : undefined)
        )
      }

      return type.createAndFill({ alignment }, textNode ? [textNode] : undefined)
    }

    const headerCells = parsed.headers
      .map((cell, index) => createCell(headerCellType, cell, parsed.alignments[index] || 'left'))
      .filter((cell): cell is NonNullable<typeof cell> => cell != null)

    if (headerCells.length !== parsed.headers.length) {
      appendMarkdownBlock(markdown)
      return
    }

    const headerRow = headerRowType.createAndFill(null, headerCells)

    const bodyRows = parsed.bodyRows.map((row) => {
      const cells = row
        .map((cell, index) => createCell(cellType, cell, parsed.alignments[index] || 'left'))
        .filter((cell): cell is NonNullable<typeof cell> => cell != null)

      if (cells.length !== row.length) return null
      return rowType.createAndFill(null, cells)
    })

    if (!headerRow || bodyRows.some(row => !row)) {
      appendMarkdownBlock(markdown)
      return
    }

    const tableRows = [headerRow, ...bodyRows.filter((row): row is NonNullable<typeof row> => row != null)]
    const tableNode = tableType.createAndFill(null, tableRows)
    if (!tableNode) {
      appendMarkdownBlock(markdown)
      return
    }

    try {
      applyPreciseBlockInsert(
        state,
        dispatch,
        paragraphType,
        [tableNode],
        tableNode.nodeSize + 1,
      )
      view.focus()
    } catch {
      appendMarkdownBlock(markdown)
    }
  })
}

function insertCodeBlockPrecisely() {
  const editor = getEditor()
  if (!editor || loading.value) return

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const codeBlockType = state.schema.nodes.code_block
    const paragraphType = state.schema.nodes.paragraph
    if (!codeBlockType || !paragraphType) {
      appendMarkdownBlock('```\n\n```')
      return
    }

    const codeBlock = codeBlockType.createAndFill()
    if (!codeBlock) {
      appendMarkdownBlock('```\n\n```')
      return
    }

    applyPreciseBlockInsert(
      state,
      dispatch,
      paragraphType,
      [codeBlock],
      1,
    )
    view.focus()
  })
}

function insertMathBlockPrecisely() {
  const editor = getEditor()
  if (!editor || loading.value) return

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const paragraphType = state.schema.nodes.paragraph
    if (!paragraphType) {
      appendMarkdownBlock('$$\n\n$$')
      return
    }

    const openLine = createParagraphNode(paragraphType, '$$')
    const bodyLine = createParagraphNode(paragraphType)
    const closeLine = createParagraphNode(paragraphType, '$$')
    if (!openLine || !bodyLine || !closeLine) {
      appendMarkdownBlock('$$\n\n$$')
      return
    }

    applyPreciseBlockInsert(
      state,
      dispatch,
      paragraphType,
      [openLine, bodyLine, closeLine],
      openLine.nodeSize + 1,
    )
    view.focus()
  })
}

function insertHrPrecisely() {
  const editor = getEditor()
  if (!editor || loading.value) return

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const hrType = state.schema.nodes.hr
    const paragraphType = state.schema.nodes.paragraph
    if (!hrType || !paragraphType) {
      appendMarkdownBlock('---')
      return
    }

    const hrNode = hrType.createAndFill() || hrType.create()
    const trailingParagraph = paragraphType.createAndFill()
    if (!hrNode || !trailingParagraph) {
      appendMarkdownBlock('---')
      return
    }

    applyPreciseBlockInsert(
      state,
      dispatch,
      paragraphType,
      [hrNode],
      hrNode.nodeSize + 1,
      trailingParagraph,
    )
    view.focus()
  })
}

function getTextblockDepth($from: ResolvedPos): number | null {
  for (let d = $from.depth; d >= 1; d--) {
    if ($from.node(d).type.isTextblock) return d
  }
  return null
}

function findAncestorDepth(state: EditorState, nodeName: string): number | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === nodeName) return depth
  }
  return null
}

function inListKind($pos: ResolvedPos, kind: 'bullet_list' | 'ordered_list'): boolean {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === kind) return true
  }
  return false
}

function nextFootnoteIndex(md: string): number {
  let max = 0
  const re = /\[\^(\d+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md)) !== null) {
    const n = parseInt(m[1], 10)
    if (!Number.isNaN(n)) max = Math.max(max, n)
  }
  return max + 1
}

function insertHyperlinkMark() {
  const editor = getEditor()
  if (!editor || loading.value) return
  const href = typeof window !== 'undefined' ? window.prompt('链接地址', 'https://') : null
  if (href === null) return
  const normalizedHref = href.trim()
  if (!normalizedHref) {
    editorStore.showStatusToast('链接地址不能为空')
    return
  }
  editor.action((ctx) => {
    const commands = ctx.get(commandsCtx)
    const view = ctx.get(editorViewCtx)
    commands.call(toggleLinkCommand.key, { href: normalizedHref, title: null })
    view.focus()
  })
}

function insertImageNode() {
  const editor = getEditor()
  if (!editor || loading.value) return
  const url = typeof window !== 'undefined' ? window.prompt('图片 URL', 'https://') : null
  if (url === null) return
  const src = url.trim()
  if (!src) {
    editorStore.showStatusToast('图片 URL 不能为空')
    return
  }
  const altRaw = typeof window !== 'undefined' ? window.prompt('替代文本', 'image') : null
  const normalizedAlt = (altRaw?.trim() || 'image')
  editor.action((ctx) => {
    const commands = ctx.get(commandsCtx)
    const view = ctx.get(editorViewCtx)
    commands.call(insertImageCommand.key, { src, alt: normalizedAlt, title: '' })
    view.focus()
  })
}

function toggleBlockquote() {
  const editor = getEditor()
  if (!editor || loading.value) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const commands = ctx.get(commandsCtx)

    if (findAncestorDepth(view.state, 'blockquote') != null) {
      let guard = 0
      while (findAncestorDepth(view.state, 'blockquote') != null && guard++ < 28) {
        const ok = lift(view.state, (tr) => view.dispatch(tr.scrollIntoView()))
        if (!ok) break
      }
      view.focus()
      return
    }
    commands.call(wrapInBlockquoteCommand.key)
    view.focus()
  })
}

function toggleListKind(kind: 'bullet_list' | 'ordered_list') {
  const editor = getEditor()
  if (!editor || loading.value) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const commands = ctx.get(commandsCtx)
    const itemType = view.state.schema.nodes.list_item
    if (!itemType) return

    const liftCmd = liftListItem(itemType)
    const other: 'bullet_list' | 'ordered_list' = kind === 'bullet_list' ? 'ordered_list' : 'bullet_list'
    const $from = () => view.state.selection.$from

    if (inListKind($from(), kind)) {
      let guard = 0
      while (inListKind($from(), kind) && guard++ < 48) {
        if (!liftCmd(view.state, (tr) => view.dispatch(tr.scrollIntoView()))) break
      }
      view.focus()
      return
    }

    if (inListKind($from(), other)) {
      let guard = 0
      while ((inListKind($from(), 'bullet_list') || inListKind($from(), 'ordered_list')) && guard++ < 48) {
        if (!liftCmd(view.state, (tr) => view.dispatch(tr.scrollIntoView()))) break
      }
    }

    if (kind === 'bullet_list') {
      commands.call(wrapInBulletListCommand.key)
    } else {
      commands.call(wrapInOrderedListCommand.key)
    }
    view.focus()
  })
}

function toggleOrderedList() {
  toggleListKind('ordered_list')
}

function toggleBulletList() {
  toggleListKind('bullet_list')
}

function toggleTaskList() {
  const editor = getEditor()
  if (!editor || loading.value) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const commands = ctx.get(commandsCtx)
    const listItemType = view.state.schema.nodes.list_item

    function makeToggleTransaction(state: EditorState) {
      const { $from } = state.selection
      for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d)
        if (node.type !== listItemType) continue
        const pos = $from.before(d)
        const attrs = { ...node.attrs }
        if (attrs.checked == null) {
          attrs.checked = false
        } else {
          attrs.checked = null
        }
        return state.tr.setNodeMarkup(pos, undefined, attrs)
      }
      return null
    }

    let baseState = view.state
    let tr = makeToggleTransaction(baseState)
    if (!tr) {
      commands.call(wrapInBulletListCommand.key)
      baseState = view.state
      tr = makeToggleTransaction(baseState)
      if (!tr && listItemType) {
        const { $from } = baseState.selection
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d)
          if (node.type === listItemType) {
            const pos = $from.before(d)
            tr = baseState.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              checked: false,
            })
            break
          }
        }
      }
    }
    if (tr) {
      view.dispatch(tr.scrollIntoView())
    }
    view.focus()
  })
}

function insertParagraphAdjacent(below: boolean) {
  const editor = getEditor()
  if (!editor || loading.value) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const { $from } = state.selection
    const depth = getTextblockDepth($from)
    const paragraph = state.schema.nodes.paragraph
    if (depth === null || !paragraph) return
    const leaf = paragraph.createAndFill()
    if (!leaf) return
    const pos = below ? $from.after(depth) : $from.before(depth)
    let tr = state.tr.insert(pos, leaf)
    const caret = pos + 1
    try {
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(caret, tr.doc.content.size))))
    } catch {
      // ignore invalid caret
    }
    dispatch(tr.scrollIntoView())
    view.focus()
  })
}

function hasFrontMatter(markdown: string): boolean {
  const normalized = markdown.replace(/^\ufeff/, '').trimStart()
  return /^---\r?\n/.test(normalized)
}

function insertFootnoteSnippet() {
  const md = props.modelValue.replace(/^\ufeff/, '')
  const n = nextFootnoteIndex(md)
  const refText = `[^${n}]`
  const defLine = `[^${n}]: `
  const base = md.replace(/\s*$/, '')
  const next = `${base}\n\n${refText}\n\n${defLine}\n`
  emit('update:modelValue', next)
  editorStore.showStatusToast('脚注已按 Markdown 原文写入文末附近（预览需 markdown-it-footnote）')
}

function insertTocPlaceholder() {
  const md = props.modelValue.replace(/^\ufeff/, '').replace(/\s*$/, '')
  const next = md ? `${md}\n\n[TOC]\n` : '[TOC]\n'
  emit('update:modelValue', next)
  editorStore.showStatusToast('[TOC] 已写入 Markdown；预览未加目录插件时为普通文本')
}

function insertYamlFrontMatterIfAbsent() {
  const raw = props.modelValue.replace(/^\ufeff/, '')
  if (hasFrontMatter(raw)) {
    editorStore.showStatusToast('文档开头已包含 YAML Front Matter，未重复插入')
    return
  }
  const date = new Date().toISOString().slice(0, 10)
  const block = `---\ntitle: \ndate: ${date}\n---\n\n`
  emit('update:modelValue', block + raw)
  editorStore.showStatusToast('YAML Front Matter 已写入文档开头')
}

function showCommentUnsupportedInWysiwyg() {
  editorStore.showStatusToast('注释命令建议仅在源码模式使用（WYSIWYG 下避免重复文本误改）')
}

function handleFormatCommand(command: string, data?: string) {
  switch (command) {
    case 'table-insert':
      if (data) {
        insertTableBlock(data)
      }
      break
    case 'bold': toggleMark('strong'); break
    case 'italic': toggleMark('emphasis'); break
    case 'code': toggleMark('inlineCode'); break
    case 'strikethrough': toggleStrikethrough(); break
    case 'paragraph': setParagraph(); break
    case 'promote-heading': promoteHeading(); break
    case 'demote-heading': demoteHeading(); break
    case 'code-block': insertCodeBlockPrecisely(); break
    case 'math-block': insertMathBlockPrecisely(); break
    case 'horizontal-rule': insertHrPrecisely(); break
    case 'clear-format': clearAllMarks(); break
    case 'underline': toggleMark('underline'); break
    case 'comment':
      showCommentUnsupportedInWysiwyg()
      break
    case 'hyperlink':
      insertHyperlinkMark()
      break
    case 'image':
      insertImageNode()
      break
    case 'blockquote':
      toggleBlockquote()
      break
    case 'ordered-list':
      toggleOrderedList()
      break
    case 'unordered-list':
      toggleBulletList()
      break
    case 'task-list':
      toggleTaskList()
      break
    case 'insert-above':
      insertParagraphAdjacent(false)
      break
    case 'insert-below':
      insertParagraphAdjacent(true)
      break
    case 'footnote':
      insertFootnoteSnippet()
      break
    case 'toc':
      insertTocPlaceholder()
      break
    case 'yaml-front-matter':
      insertYamlFrontMatterIfAbsent()
      break
  }
}

watch(() => editorStore.headingRequest, (req) => {
  if (!req) return
  setHeading(req.level)
  editorStore.clearHeadingRequest()
})

watch(() => editorStore.formatRequest, (req) => {
  if (!req) return
  handleFormatCommand(req.command, req.data)
  editorStore.clearFormatRequest()
})
</script>

<template>
  <Milkdown />
</template>
