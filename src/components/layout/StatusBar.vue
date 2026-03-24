<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useSettingsStore, BUILT_IN_THEMES } from '@/stores/settings'
import { useFileStore } from '@/stores/file'
import ExportMenu from '@/components/export/ExportMenu.vue'

const editorStore = useEditorStore()
const settingsStore = useSettingsStore()
const fileStore = useFileStore()
const showExportMenu = ref(false)
const exportWrapperRef = ref<HTMLDivElement>()

let outsideClickHandler: ((e: MouseEvent) => void) | null = null

function setupOutsideClick() {
  cleanupOutsideClick()
  outsideClickHandler = (e: MouseEvent) => {
    if (exportWrapperRef.value && !exportWrapperRef.value.contains(e.target as Node)) {
      showExportMenu.value = false
    }
  }
  setTimeout(() => {
    document.addEventListener('click', outsideClickHandler!)
  }, 0)
}

function cleanupOutsideClick() {
  if (outsideClickHandler) {
    document.removeEventListener('click', outsideClickHandler)
    outsideClickHandler = null
  }
}

watch(showExportMenu, (val) => {
  if (val) {
    setupOutsideClick()
  } else {
    cleanupOutsideClick()
  }
})

onUnmounted(() => {
  cleanupOutsideClick()
})

const emit = defineEmits<{
  'open-table-editor': []
}>()

const modeLabels: Record<string, string> = {
  wysiwyg: '所见即所得',
  split: '分栏预览',
  source: '源码模式',
}

const themeLabels: Record<string, string> = Object.fromEntries(
  BUILT_IN_THEMES.map(t => [t.id, t.label])
)

function cycleEditorMode() {
  const modes: Array<'wysiwyg' | 'split' | 'source'> = ['wysiwyg', 'split', 'source']
  const currentIdx = modes.indexOf(settingsStore.editorMode)
  const nextIdx = (currentIdx + 1) % modes.length
  settingsStore.setEditorMode(modes[nextIdx])
}

function toggleExportMenu() {
  showExportMenu.value = !showExportMenu.value
}

async function pickCustomTheme() {
  await settingsStore.pickAndLoadCustomCss()
}
</script>

<template>
  <div v-if="settingsStore.showStatusBar" class="statusbar">
    <div class="statusbar-left">
      <span class="status-item" v-if="fileStore.activeTab">
        字数: {{ editorStore.wordCount }}
      </span>
      <span class="status-item" v-if="fileStore.activeTab">
        字符: {{ editorStore.charCount }}
      </span>
      <span class="status-item" v-if="fileStore.activeTab">
        行数: {{ editorStore.lineCount }}
      </span>
      <button
        class="status-item status-btn"
        :class="{ active: settingsStore.autoSave }"
        @click="settingsStore.setAutoSave(!settingsStore.autoSave)"
        :title="settingsStore.autoSave ? '自动保存已开启 (' + settingsStore.autoSaveInterval + 's)' : '自动保存已关闭'"
      >
        {{ settingsStore.autoSave ? '自动保存' : '手动保存' }}
      </button>
    </div>

    <div class="statusbar-right">
      <span class="status-item" v-if="fileStore.activeTab">
        行 {{ editorStore.cursorLine }}, 列 {{ editorStore.cursorColumn }}
      </span>
      <span class="status-item">{{ editorStore.encoding }}</span>
      <span class="status-item" title="字体大小 (Ctrl+/-/0)">{{ settingsStore.fontSize }}px</span>

      <div v-if="fileStore.activeTab" ref="exportWrapperRef" class="export-wrapper">
        <button
          class="status-item status-btn"
          @click="toggleExportMenu"
          title="导出文档"
        >
          导出
        </button>
        <ExportMenu
          v-if="showExportMenu"
          @close="showExportMenu = false"
        />
      </div>

      <button
        class="status-item status-btn"
        @click="emit('open-table-editor')"
        title="插入表格 (Ctrl+T)"
        v-if="fileStore.activeTab"
      >
        表格
      </button>

      <button class="status-item status-btn" @click="cycleEditorMode">
        {{ modeLabels[settingsStore.editorMode] }}
      </button>

      <button
        class="status-item status-btn"
        @click="settingsStore.cycleTheme"
        :title="'当前主题: ' + themeLabels[settingsStore.theme]"
      >
        {{ themeLabels[settingsStore.theme] }}
      </button>

      <button
        class="status-item status-btn"
        :class="{ active: !!settingsStore.customCssPath }"
        @click="pickCustomTheme"
        :title="settingsStore.customCssPath || '加载自定义 CSS 主题'"
      >
        自定义CSS
      </button>

      <button
        v-if="settingsStore.customCssPath"
        class="status-item status-btn"
        @click="settingsStore.clearCustomCss"
        title="清除自定义主题"
      >
        清除CSS
      </button>

      <button
        class="status-item status-btn"
        :class="{ active: settingsStore.focusMode }"
        @click="settingsStore.toggleFocusMode"
        title="专注模式"
      >
        专注
      </button>

      <button
        class="status-item status-btn"
        :class="{ active: settingsStore.typewriterMode }"
        @click="settingsStore.toggleTypewriterMode"
        title="打字机模式"
      >
        打字机
      </button>

      <button
        class="status-item status-btn"
        :class="{ active: settingsStore.showToc }"
        @click="settingsStore.toggleToc"
        title="大纲面板"
      >
        大纲
      </button>
    </div>
  </div>
</template>

<style scoped>
.statusbar {
  height: var(--statusbar-height);
  background: var(--statusbar-bg);
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: var(--font-size-small);
  color: var(--statusbar-text);
  flex-shrink: 0;
}

.statusbar-left,
.statusbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-item {
  white-space: nowrap;
}

.status-btn {
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: var(--font-size-small);
}

.status-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.status-btn.active {
  color: var(--accent-color);
}

.export-wrapper {
  position: relative;
}
</style>
