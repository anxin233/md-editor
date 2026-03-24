<script setup lang="ts">
import { ref } from 'vue'
import { MilkdownProvider } from '@milkdown/vue'
import MilkdownEditor from './MilkdownEditor.vue'
import { useFileStore } from '@/stores/file'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const fileStore = useFileStore()
const editorRootRef = ref<HTMLDivElement>()

function onUpdate(value: string) {
  emit('update:modelValue', value)
}

async function handleImageFile(file: File) {
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
    const mdTag = `\n![${fileName}](./images/${fileName})\n`
    emit('update:modelValue', props.modelValue + mdTag)
  } catch (err) {
    console.error('Failed to save image:', err)
  }
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (file) handleImageFile(file)
      return
    }
  }
}

function onDrop(e: DragEvent) {
  const files = e.dataTransfer?.files
  if (!files) return
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      e.preventDefault()
      handleImageFile(file)
      return
    }
  }
}

function placeCaretAtEnd(editor: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function focusEditor(event?: MouseEvent) {
  const editor = editorRootRef.value?.querySelector('.ProseMirror') as HTMLElement | null
  if (!editor) return

  const target = event?.target as HTMLElement | null
  const clickedEditor = !!target?.closest('.ProseMirror')

  editor.focus()
  if (!clickedEditor) {
    placeCaretAtEnd(editor)
  }
}
</script>

<template>
  <div
    ref="editorRootRef"
    class="wysiwyg-editor"
    @paste="onPaste"
    @drop.prevent="onDrop"
    @dragover.prevent
    @mousedown="focusEditor"
  >
    <MilkdownProvider>
      <MilkdownEditor
        :modelValue="modelValue"
        @update:modelValue="onUpdate"
      />
    </MilkdownProvider>
  </div>
</template>

<style scoped>
.wysiwyg-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 24px 36px;
  background: var(--editor-bg);
  cursor: text;
}
</style>

<style>
.milkdown {
  flex: 1;
  min-height: 100%;
  display: flex;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

.milkdown .editor {
  flex: 1;
  min-height: 100%;
  display: flex;
  outline: none;
}

.milkdown .ProseMirror {
  flex: 1;
  outline: none;
  min-height: 100%;
  padding-bottom: 45vh;
  font-size: var(--font-size-editor);
  line-height: 1.8;
  color: var(--text-primary);
  cursor: text;
  caret-color: var(--editor-caret);
}

.milkdown .ProseMirror-focused {
  box-shadow: inset 0 0 0 1px var(--editor-caret-glow);
  border-radius: var(--radius-sm);
}

.milkdown .ProseMirror > * + * {
  margin-top: 0.5em;
}

.milkdown .ProseMirror h1 {
  font-size: 2em;
  font-weight: 700;
  margin-top: 1em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--border-color);
}

.milkdown .ProseMirror h2 {
  font-size: 1.5em;
  font-weight: 600;
  margin-top: 0.8em;
  padding-bottom: 0.25em;
  border-bottom: 1px solid var(--border-light);
}

.milkdown .ProseMirror h3 { font-size: 1.25em; font-weight: 600; margin-top: 0.8em; }
.milkdown .ProseMirror h4 { font-size: 1.1em; font-weight: 600; margin-top: 0.6em; }

.milkdown .ProseMirror p {
  margin: 0.4em 0;
}

.milkdown .ProseMirror strong { font-weight: 600; }
.milkdown .ProseMirror em { font-style: italic; }

.milkdown .ProseMirror blockquote {
  padding: 0.5em 1em;
  border-left: 4px solid var(--accent-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  margin: 0.8em 0;
}

.milkdown .ProseMirror ul,
.milkdown .ProseMirror ol {
  padding-left: 1.5em;
}

.milkdown .ProseMirror li {
  margin: 0.2em 0;
}

.milkdown .ProseMirror code {
  font-family: var(--font-family-mono);
  font-size: 0.9em;
  padding: 2px 6px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--accent-color);
}

.milkdown .ProseMirror pre {
  margin: 1em 0;
  padding: 16px 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow-x: auto;
}

.milkdown .ProseMirror pre code {
  padding: 0;
  background: none;
  color: var(--text-primary);
  font-size: 0.85em;
  line-height: 1.6;
}

.milkdown .ProseMirror table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
}

.milkdown .ProseMirror th,
.milkdown .ProseMirror td {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  text-align: left;
}

.milkdown .ProseMirror th {
  background: var(--bg-secondary);
  font-weight: 600;
}

.milkdown .ProseMirror img {
  max-width: 100%;
  border-radius: var(--radius-md);
}

.milkdown .ProseMirror hr {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 1.5em 0;
}

.milkdown .ProseMirror a {
  color: var(--accent-color);
  text-decoration: none;
}

.milkdown .ProseMirror a:hover {
  text-decoration: underline;
}

.milkdown .ProseMirror .task-list-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  list-style: none;
}

.milkdown .ProseMirror .task-list-item input[type="checkbox"] {
  margin-top: 5px;
}

.milkdown .ProseMirror ::selection {
  background-color: var(--editor-selection);
}
</style>
