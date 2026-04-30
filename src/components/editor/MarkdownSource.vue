<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, shallowRef } from 'vue'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from '@codemirror/view'
import { EditorState, Compartment, EditorSelection } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap, HighlightStyle } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { search, highlightSelectionMatches } from '@codemirror/search'
import { tags } from '@lezer/highlight'
import { useSettingsStore } from '@/stores/settings'
import { useEditorStore } from '@/stores/editor'
import { useFileStore } from '@/stores/file'
import { useContextMenuStore } from '@/stores/contextMenu'
import { buildTyporaCodeMirrorMenu } from '@/utils/editorContextMenu'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'scroll': [scrollInfo: { scrollTop: number; scrollHeight: number; clientHeight: number }]
}>()

const settingsStore = useSettingsStore()
const editorStore = useEditorStore()
const fileStore = useFileStore()
const contextMenuStore = useContextMenuStore()
const editorRef = ref<HTMLDivElement>()
const view = shallowRef<EditorView>()
const themeCompartment = new Compartment()
let isInternalUpdate = false

const darkHighlight = HighlightStyle.define([
  { tag: tags.heading1, color: '#e06c75', fontSize: '1.4em', fontWeight: 'bold' },
  { tag: tags.heading2, color: '#e06c75', fontSize: '1.3em', fontWeight: 'bold' },
  { tag: tags.heading3, color: '#e06c75', fontSize: '1.2em', fontWeight: 'bold' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], color: '#e06c75', fontWeight: 'bold' },
  { tag: tags.strong, color: '#d19a66', fontWeight: 'bold' },
  { tag: tags.emphasis, color: '#c678dd', fontStyle: 'italic' },
  { tag: tags.strikethrough, color: '#7f848e', textDecoration: 'line-through' },
  { tag: tags.link, color: '#61afef', textDecoration: 'underline' },
  { tag: tags.url, color: '#61afef' },
  { tag: tags.monospace, color: '#98c379', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px', padding: '1px 4px' },
  { tag: tags.meta, color: '#7f848e' },
  { tag: tags.quote, color: '#7f848e', fontStyle: 'italic' },
  { tag: tags.list, color: '#61afef' },
  { tag: tags.keyword, color: '#c678dd' },
  { tag: tags.string, color: '#98c379' },
  { tag: tags.number, color: '#d19a66' },
  { tag: tags.comment, color: '#5c6370', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: '#7f848e' },
])

const lightHighlight = HighlightStyle.define([
  { tag: tags.heading1, color: '#c0392b', fontSize: '1.4em', fontWeight: 'bold' },
  { tag: tags.heading2, color: '#c0392b', fontSize: '1.3em', fontWeight: 'bold' },
  { tag: tags.heading3, color: '#c0392b', fontSize: '1.2em', fontWeight: 'bold' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], color: '#c0392b', fontWeight: 'bold' },
  { tag: tags.strong, color: '#d35400', fontWeight: 'bold' },
  { tag: tags.emphasis, color: '#8e44ad', fontStyle: 'italic' },
  { tag: tags.strikethrough, color: '#999', textDecoration: 'line-through' },
  { tag: tags.link, color: '#2980b9', textDecoration: 'underline' },
  { tag: tags.url, color: '#2980b9' },
  { tag: tags.monospace, color: '#27ae60', backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: '3px', padding: '1px 4px' },
  { tag: tags.meta, color: '#999' },
  { tag: tags.quote, color: '#888', fontStyle: 'italic' },
  { tag: tags.list, color: '#2980b9' },
  { tag: tags.keyword, color: '#8e44ad' },
  { tag: tags.string, color: '#27ae60' },
  { tag: tags.number, color: '#d35400' },
  { tag: tags.comment, color: '#aaa', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: '#999' },
])

function createDarkTheme() {
  return [
    EditorView.theme({
      '&': { backgroundColor: 'var(--editor-bg)', color: 'var(--text-primary)' },
      '.cm-content': { caretColor: 'var(--editor-caret)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-editor)', lineHeight: '1.75', padding: '16px 0' },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--editor-caret) !important',
        borderLeftWidth: '2px !important',
      },
      '.cm-cursorLayer': {
        filter: 'drop-shadow(0 0 2px var(--editor-caret-glow))',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--editor-selection) !important' },
      '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.04)' },
      '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.04)' },
      '.cm-gutters': { backgroundColor: 'var(--editor-bg)', color: 'var(--editor-line-number)', border: 'none', paddingRight: '8px' },
      '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 16px', minWidth: '40px' },
      '.cm-foldGutter .cm-gutterElement': { padding: '0 4px' },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-scroller': { overflow: 'auto' },
    }, { dark: true }),
    syntaxHighlighting(darkHighlight),
  ]
}

function createLightTheme() {
  return [
    EditorView.theme({
      '&': { backgroundColor: 'var(--editor-bg)', color: 'var(--text-primary)' },
      '.cm-content': { caretColor: 'var(--editor-caret)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-editor)', lineHeight: '1.75', padding: '16px 0' },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--editor-caret) !important',
        borderLeftWidth: '2px !important',
      },
      '.cm-cursorLayer': {
        filter: 'drop-shadow(0 0 2px var(--editor-caret-glow))',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--editor-selection) !important' },
      '.cm-activeLine': { backgroundColor: 'rgba(0,0,0,0.03)' },
      '.cm-activeLineGutter': { backgroundColor: 'rgba(0,0,0,0.03)' },
      '.cm-gutters': { backgroundColor: 'var(--editor-bg)', color: 'var(--editor-line-number)', border: 'none', paddingRight: '8px' },
      '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 16px', minWidth: '40px' },
      '.cm-foldGutter .cm-gutterElement': { padding: '0 4px' },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-scroller': { overflow: 'auto' },
    }, { dark: false }),
    syntaxHighlighting(lightHighlight),
  ]
}

function getThemeExtension() {
  const isDark = settingsStore.theme === 'dark' || settingsStore.theme === 'nord'
  return isDark ? createDarkTheme() : createLightTheme()
}

async function handleImagePaste(file: File) {
  const tab = fileStore.activeTab
  if (!tab) return

  let basePath: string | null = null
  if (tab.filePath) {
    const parts = tab.filePath.replace(/\\/g, '/')
    basePath = parts.substring(0, parts.lastIndexOf('/'))
  }

  if (!basePath) {
    alert('请先保存文件，然后再粘贴图片')
    return
  }

  try {
    const buffer = new Uint8Array(await file.arrayBuffer())
    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    const fileName = `image-${Date.now()}.${ext}`
    await window.electronAPI?.file.saveImage(basePath, fileName, buffer)
    const mdTag = `![${fileName}](./images/${fileName})`
    insertTextAtCursor(mdTag)
  } catch (err) {
    console.error('Failed to save image:', err)
  }
}

function insertTextAtCursor(text: string) {
  if (!view.value) return
  const cursor = view.value.state.selection.main.head
  view.value.dispatch({
    changes: { from: cursor, insert: text },
    selection: { anchor: cursor + text.length },
  })
  view.value.focus()
}

function focusEditor(event?: MouseEvent) {
  if (!view.value) return

  const target = event?.target as HTMLElement | null
  const clickedContent = !!target?.closest('.cm-content')
  if (!clickedContent) {
    const end = view.value.state.doc.length
    view.value.dispatch({
      selection: { anchor: end, head: end },
      effects: EditorView.scrollIntoView(end, { y: 'end' }),
    })
  }

  view.value.focus()
}

function createEditor() {
  if (!editorRef.value) return

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      search({ top: true }),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        indentWithTab,
      ]),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      themeCompartment.of(getThemeExtension()),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          isInternalUpdate = true
          emit('update:modelValue', update.state.doc.toString())
          isInternalUpdate = false
        }

        if (update.selectionSet || update.docChanged) {
          const pos = update.state.selection.main.head
          const line = update.state.doc.lineAt(pos)
          editorStore.updateCursor(line.number, pos - line.from + 1)

          if (settingsStore.typewriterMode) {
            requestAnimationFrame(() => {
              update.view.dispatch({
                effects: EditorView.scrollIntoView(pos, { y: 'center' }),
              })
            })
          }
        }
      }),
      EditorView.domEventHandlers({
        scroll: (_event, editorView) => {
          const scroller = editorView.scrollDOM
          emit('scroll', {
            scrollTop: scroller.scrollTop,
            scrollHeight: scroller.scrollHeight,
            clientHeight: scroller.clientHeight,
          })
        },
        paste: (event) => {
          const items = event.clipboardData?.items
          if (!items) return false
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              event.preventDefault()
              const file = item.getAsFile()
              if (file) handleImagePaste(file)
              return true
            }
          }
          return false
        },
        drop: (event) => {
          const files = event.dataTransfer?.files
          if (!files) return false
          for (const file of files) {
            if (file.type.startsWith('image/')) {
              event.preventDefault()
              handleImagePaste(file)
              return true
            }
          }
          return false
        },
        contextmenu: (event, editorView) => {
          event.preventDefault()
          const cx = editorView.posAtCoords({ x: event.clientX, y: event.clientY })
          const clickPos = cx ?? editorView.state.selection.main.head

          const sel = editorView.state.selection.main
          if (!sel.empty) {
            if (clickPos < sel.from || clickPos > sel.to) {
              editorView.dispatch({ selection: EditorSelection.cursor(clickPos) })
            }
          } else {
            editorView.dispatch({ selection: EditorSelection.cursor(clickPos) })
          }

          contextMenuStore.show({
            clientX: event.clientX,
            clientY: event.clientY,
            items: buildTyporaCodeMirrorMenu(editorView, clickPos),
          })
          return true
        },
      }),
      EditorView.lineWrapping,
    ],
  })

  view.value = new EditorView({
    state,
    parent: editorRef.value,
  })
}

watch(() => props.modelValue, (newVal) => {
  if (isInternalUpdate || !view.value) return
  const currentVal = view.value.state.doc.toString()
  if (newVal !== currentVal) {
    view.value.dispatch({
      changes: { from: 0, to: currentVal.length, insert: newVal }
    })
  }
})

watch(() => settingsStore.theme, () => {
  if (view.value) {
    view.value.dispatch({
      effects: themeCompartment.reconfigure(getThemeExtension())
    })
  }
})

function setHeading(level: number) {
  if (!view.value) return
  const state = view.value.state
  const { head } = state.selection.main
  const line = state.doc.lineAt(head)
  const text = line.text
  const match = text.match(/^(#{1,6})\s/)

  let from = line.from
  let to = line.from
  let insert = ''

  if (match) {
    to = from + match[0].length
    insert = match[1].length === level ? '' : '#'.repeat(level) + ' '
  } else {
    insert = '#'.repeat(level) + ' '
  }

  view.value.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
  })
  view.value.focus()
}

function wrapSelection(prefix: string, suffix: string) {
  if (!view.value) return
  const state = view.value.state
  const { from, to } = state.selection.main
  const selected = state.sliceDoc(from, to)

  const beforeFrom = Math.max(0, from - prefix.length)
  const afterTo = Math.min(state.doc.length, to + suffix.length)
  const before = state.sliceDoc(beforeFrom, from)
  const after = state.sliceDoc(to, afterTo)

  if (before === prefix && after === suffix) {
    view.value.dispatch({
      changes: [
        { from: beforeFrom, to: from, insert: '' },
        { from: to, to: afterTo, insert: '' },
      ],
      selection: { anchor: beforeFrom, head: beforeFrom + selected.length },
    })
  } else if (selected.startsWith(prefix) && selected.endsWith(suffix) && selected.length >= prefix.length + suffix.length) {
    const inner = selected.slice(prefix.length, selected.length - suffix.length)
    view.value.dispatch({
      changes: { from, to, insert: inner },
      selection: { anchor: from, head: from + inner.length },
    })
  } else {
    const wrapped = prefix + (selected || prefix === '`' ? selected : 'text') + suffix
    view.value.dispatch({
      changes: { from, to, insert: wrapped },
      selection: selected
        ? { anchor: from + prefix.length, head: from + prefix.length + selected.length }
        : { anchor: from + prefix.length, head: from + wrapped.length - suffix.length },
    })
  }
  view.value.focus()
}

function toggleLinePrefix(prefix: string) {
  if (!view.value) return
  const state = view.value.state
  const { from, to } = state.selection.main
  const startLine = state.doc.lineAt(from)
  const endLine = state.doc.lineAt(to)

  const changes: { from: number; to: number; insert: string }[] = []
  let allHavePrefix = true

  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i)
    if (!line.text.startsWith(prefix)) {
      allHavePrefix = false
      break
    }
  }

  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i)
    if (allHavePrefix) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: '' })
    } else if (!line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from, insert: prefix })
    }
  }

  view.value.dispatch({ changes })
  view.value.focus()
}

function setParagraph() {
  if (!view.value) return
  const state = view.value.state
  const { head } = state.selection.main
  const line = state.doc.lineAt(head)
  const match = line.text.match(/^#{1,6}\s/)
  if (match) {
    view.value.dispatch({
      changes: { from: line.from, to: line.from + match[0].length, insert: '' },
    })
  }
  view.value.focus()
}

function promoteHeading() {
  if (!view.value) return
  const state = view.value.state
  const { head } = state.selection.main
  const line = state.doc.lineAt(head)
  const match = line.text.match(/^(#{1,6})\s/)
  if (match) {
    const level = match[1].length
    if (level > 1) setHeading(level - 1)
  } else {
    setHeading(6)
  }
}

function demoteHeading() {
  if (!view.value) return
  const state = view.value.state
  const { head } = state.selection.main
  const line = state.doc.lineAt(head)
  const match = line.text.match(/^(#{1,6})\s/)
  if (match) {
    const level = match[1].length
    if (level < 6) setHeading(level + 1)
    else setParagraph()
  }
}

function insertBlock(text: string) {
  if (!view.value) return
  const state = view.value.state
  const { head } = state.selection.main
  const line = state.doc.lineAt(head)
  const insertPos = line.to
  const prefix = line.text.length > 0 ? '\n' : ''
  const full = prefix + text + '\n'
  view.value.dispatch({
    changes: { from: insertPos, insert: full },
    selection: { anchor: insertPos + full.length },
  })
  view.value.focus()
}

function insertParagraphAbove() {
  if (!view.value) return
  const state = view.value.state
  const { head } = state.selection.main
  const line = state.doc.lineAt(head)
  view.value.dispatch({
    changes: { from: line.from, insert: '\n' },
    selection: { anchor: line.from },
  })
  view.value.focus()
}

function insertParagraphBelow() {
  if (!view.value) return
  const state = view.value.state
  const { head } = state.selection.main
  const line = state.doc.lineAt(head)
  view.value.dispatch({
    changes: { from: line.to, insert: '\n' },
    selection: { anchor: line.to + 1 },
  })
  view.value.focus()
}

function insertHyperlink() {
  if (!view.value) return
  const state = view.value.state
  const { from, to } = state.selection.main
  const selected = state.sliceDoc(from, to)
  const link = selected ? `[${selected}](url)` : '[link text](url)'
  const cursorPos = selected ? from + selected.length + 3 : from + 1
  view.value.dispatch({
    changes: { from, to, insert: link },
    selection: { anchor: cursorPos, head: selected ? cursorPos + 3 : cursorPos + 9 },
  })
  view.value.focus()
}

function insertImage() {
  if (!view.value) return
  const state = view.value.state
  const { from, to } = state.selection.main
  const selected = state.sliceDoc(from, to)
  const img = selected ? `![${selected}](url)` : '![alt text](url)'
  view.value.dispatch({
    changes: { from, to, insert: img },
  })
  view.value.focus()
}

function clearFormat() {
  if (!view.value) return
  const state = view.value.state
  const { from, to } = state.selection.main
  if (from === to) return
  let text = state.sliceDoc(from, to)
  text = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/<u>(.+?)<\/u>/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/!\[(.+?)\]\(.+?\)/g, '$1')
  view.value.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from, head: from + text.length },
  })
  view.value.focus()
}

function toggleOrderedList() {
  if (!view.value) return
  const state = view.value.state
  const { from, to } = state.selection.main
  const startLine = state.doc.lineAt(from)
  const endLine = state.doc.lineAt(to)

  const changes: { from: number; to: number; insert: string }[] = []
  let allOrdered = true

  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i)
    if (!line.text.match(/^\d+\.\s/)) {
      allOrdered = false
      break
    }
  }

  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i)
    if (allOrdered) {
      const m = line.text.match(/^\d+\.\s/)
      if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: '' })
    } else {
      const num = i - startLine.number + 1
      const m = line.text.match(/^\d+\.\s/)
      if (m) {
        changes.push({ from: line.from, to: line.from + m[0].length, insert: `${num}. ` })
      } else {
        changes.push({ from: line.from, to: line.from, insert: `${num}. ` })
      }
    }
  }

  view.value.dispatch({ changes })
  view.value.focus()
}

function insertYamlFrontMatter() {
  if (!view.value) return
  const state = view.value.state
  const docText = state.doc.toString()
  if (docText.startsWith('---')) return
  const fm = '---\ntitle: \ndate: ' + new Date().toISOString().split('T')[0] + '\n---\n\n'
  view.value.dispatch({
    changes: { from: 0, insert: fm },
    selection: { anchor: 11 },
  })
  view.value.focus()
}

function handleFormatCommand(command: string, data?: string) {
  if (!view.value) return
  switch (command) {
    case 'table-insert':
      if (data) insertBlock('\n' + data + '\n')
      break
    case 'bold': wrapSelection('**', '**'); break
    case 'italic': wrapSelection('*', '*'); break
    case 'underline': wrapSelection('<u>', '</u>'); break
    case 'code': wrapSelection('`', '`'); break
    case 'strikethrough': wrapSelection('~~', '~~'); break
    case 'comment': wrapSelection('<!-- ', ' -->'); break
    case 'hyperlink': insertHyperlink(); break
    case 'image': insertImage(); break
    case 'clear-format': clearFormat(); break
    case 'paragraph': setParagraph(); break
    case 'promote-heading': promoteHeading(); break
    case 'demote-heading': demoteHeading(); break
    case 'code-block': insertBlock('```\n\n```'); break
    case 'math-block': insertBlock('$$\n\n$$'); break
    case 'blockquote': toggleLinePrefix('> '); break
    case 'ordered-list': toggleOrderedList(); break
    case 'unordered-list': toggleLinePrefix('- '); break
    case 'task-list': toggleLinePrefix('- [ ] '); break
    case 'horizontal-rule': insertBlock('---'); break
    case 'insert-above': insertParagraphAbove(); break
    case 'insert-below': insertParagraphBelow(); break
    case 'footnote': insertBlock('[^1]: '); break
    case 'toc': insertBlock('[TOC]'); break
    case 'yaml-front-matter': insertYamlFrontMatter(); break
    case 'table': break
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

watch(() => editorStore.targetScrollLine, (line) => {
  if (line == null || !view.value) return
  try {
    const docLine = view.value.state.doc.line(Math.min(line, view.value.state.doc.lines))
    view.value.dispatch({
      effects: EditorView.scrollIntoView(docLine.from, { y: 'center' }),
      selection: { anchor: docLine.from },
    })
    view.value.focus()
  } catch { /* invalid line */ }
  editorStore.clearScrollRequest()
})

onMounted(() => {
  createEditor()
})

onUnmounted(() => {
  view.value?.destroy()
})

defineExpose({
  getView: () => view.value,
  insertText: insertTextAtCursor,
  focusEditor,
  setHeading,
  selectRange: (start: number, end: number) => {
    if (!view.value) return
    view.value.dispatch({
      selection: { anchor: start, head: end },
      effects: EditorView.scrollIntoView(start, { y: 'center' }),
    })
    view.value.focus()
  },
})
</script>

<template>
  <div ref="editorRef" class="markdown-source" @mousedown="focusEditor"></div>
</template>

<style scoped>
.markdown-source {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.markdown-source :deep(.cm-editor) {
  flex: 1;
  height: 100%;
}

.markdown-source :deep(.cm-scroller) {
  min-height: 100%;
  display: flex;
}

.markdown-source :deep(.cm-content) {
  flex: 1;
  min-height: 100%;
  padding-bottom: 45vh;
}
</style>
