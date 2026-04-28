<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useFileStore } from '@/stores/file'
import { useSettingsStore } from '@/stores/settings'
import { useEditorStore } from '@/stores/editor'
import SplitEditor from './SplitEditor.vue'
import WysiwygEditor from './WysiwygEditor.vue'
import MarkdownSource from './MarkdownSource.vue'
import TableEditor from './TableEditor.vue'
import SearchReplace from './SearchReplace.vue'
import { shortcutsForWelcome } from '@/utils/shortcutRegistry'

const fileStore = useFileStore()
const settingsStore = useSettingsStore()
const editorStore = useEditorStore()
const showTableEditor = ref(false)
const sourceEditorRef = ref<InstanceType<typeof MarkdownSource>>()
const splitEditorRef = ref<InstanceType<typeof SplitEditor>>()

const welcomeShortcutRows = shortcutsForWelcome()

function onContentUpdate(value: string) {
  fileStore.updateContent(value)
}

async function openRecentFromWelcome(filePath: string) {
  try {
    const opened = await fileStore.openPath(filePath)
    if (!opened) {
      settingsStore.removeRecentFile(filePath)
      return
    }
    settingsStore.addRecentFile(filePath, opened.fileName)
  } catch {
    settingsStore.removeRecentFile(filePath)
  }
}

function openTableEditor() {
  showTableEditor.value = true
}

function onSearchContentUpdate(value: string) {
  fileStore.updateContent(value)
}

async function ensureSourceMode() {
  if (settingsStore.editorMode !== 'wysiwyg') return
  settingsStore.setEditorMode('source')
  await nextTick()
}

async function revealSearchMatch(range: { start: number; end: number }) {
  await ensureSourceMode()

  if (settingsStore.editorMode === 'source') {
    sourceEditorRef.value?.selectRange?.(range.start, range.end)
    return
  }

  if (settingsStore.editorMode === 'split') {
    splitEditorRef.value?.getSourceEditor?.()?.selectRange?.(range.start, range.end)
  }
}

function closeSearchPanel() {
  editorStore.clearSearchRequest()
}

watch(
  () => fileStore.activeTab?.content,
  (content) => {
    editorStore.updateStats(content || '')
  },
  { immediate: true }
)

defineExpose({ openTableEditor })
</script>

<template>
  <div
    class="editor-container"
    :class="{
      'focus-mode': settingsStore.focusMode,
      'typewriter-mode': settingsStore.typewriterMode,
    }"
  >
    <div v-if="!fileStore.activeTab" class="welcome">
      <div class="welcome-content">
        <h1 class="welcome-title">MD Editor</h1>
        <p class="welcome-subtitle">一个简洁的 Markdown 编辑器</p>
        <div class="welcome-shortcuts">
          <div v-for="(row, idx) in welcomeShortcutRows" :key="idx" class="shortcut-item">
            <kbd>{{ row.keys }}</kbd>
            <span>{{ row.label }}</span>
          </div>
        </div>

        <div v-if="settingsStore.recentFiles.length > 0" class="welcome-recent">
          <h3 class="recent-title">最近打开</h3>
          <div class="recent-list">
            <div
              v-for="file in settingsStore.recentFiles.slice(0, 8)"
              :key="file.path"
              class="recent-file-item"
              :title="file.path"
              @click="openRecentFromWelcome(file.path)"
            >
              <span class="recent-file-name">{{ file.name }}</span>
              <span class="recent-file-path">{{ file.path }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="editor-area">
      <SearchReplace
        :content="fileStore.activeTab.content"
        :request="editorStore.searchRequest"
        @update:content="onSearchContentUpdate"
        @reveal-match="revealSearchMatch"
        @ensure-source-mode="ensureSourceMode"
        @close="closeSearchPanel"
      />

      <WysiwygEditor
        v-if="settingsStore.editorMode === 'wysiwyg'"
        :modelValue="fileStore.activeTab.content"
        @update:modelValue="onContentUpdate"
      />

      <SplitEditor
        v-else-if="settingsStore.editorMode === 'split'"
        ref="splitEditorRef"
        :modelValue="fileStore.activeTab.content"
        @update:modelValue="onContentUpdate"
      />

      <MarkdownSource
        v-else
        ref="sourceEditorRef"
        :modelValue="fileStore.activeTab.content"
        @update:modelValue="onContentUpdate"
      />
    </div>

    <TableEditor
      v-if="showTableEditor"
      @close="showTableEditor = false"
    />
  </div>
</template>

<style scoped>
.editor-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--editor-bg);
}

.welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.welcome-content {
  text-align: center;
  color: var(--text-muted);
}

.welcome-title {
  font-size: 36px;
  font-weight: 300;
  letter-spacing: 2px;
  margin-bottom: 8px;
  color: var(--text-secondary);
}

.welcome-subtitle {
  font-size: 14px;
  margin-bottom: 40px;
}

.welcome-shortcuts {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
}

.shortcut-item kbd {
  display: inline-block;
  min-width: 80px;
  padding: 3px 8px;
  font-family: var(--font-family-mono);
  font-size: 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  text-align: center;
}

.shortcut-item span {
  color: var(--text-secondary);
}

.welcome-recent {
  margin-top: 36px;
  text-align: left;
  max-width: 400px;
  width: 100%;
}

.welcome-recent .recent-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding-left: 4px;
}

.welcome-recent .recent-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.recent-file-item {
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.recent-file-item:hover {
  background: var(--bg-hover);
}

.recent-file-name {
  font-size: 13px;
  color: var(--accent-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-file-path {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>

<style>
/* Focus mode - dim non-active lines in CodeMirror */
.editor-container.focus-mode .cm-editor .cm-line {
  opacity: 0.35;
  transition: opacity 0.2s ease;
}

.editor-container.focus-mode .cm-editor .cm-activeLine {
  opacity: 1;
}

.editor-container.focus-mode .cm-editor .cm-gutterElement {
  opacity: 0.35;
  transition: opacity 0.2s ease;
}

.editor-container.focus-mode .cm-editor .cm-activeLineGutter {
  opacity: 1;
}

/* Focus mode for Milkdown WYSIWYG */
.editor-container.focus-mode .milkdown .ProseMirror > * {
  opacity: 0.35;
  transition: opacity 0.2s ease;
}

.editor-container.focus-mode .milkdown .ProseMirror > .ProseMirror-selectednode,
.editor-container.focus-mode .milkdown .ProseMirror > *:focus-within,
.editor-container.focus-mode .milkdown .ProseMirror > *:has(.ProseMirror-cursor) {
  opacity: 1;
}
</style>
