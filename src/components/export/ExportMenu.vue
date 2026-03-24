<script setup lang="ts">
import { ref } from 'vue'
import { useFileStore } from '@/stores/file'
import { useSettingsStore } from '@/stores/settings'
import { exportToPdf, exportToHtml, exportToWord } from '@/utils/export'

const fileStore = useFileStore()
const settingsStore = useSettingsStore()
const isExporting = ref(false)
const exportStatus = ref('')

async function handleExport(type: 'pdf' | 'html' | 'word') {
  const tab = fileStore.activeTab
  if (!tab || isExporting.value) return

  isExporting.value = true
  exportStatus.value = '正在导出...'

  try {
    let success = false
    const fileName = tab.fileName || 'document.md'

    switch (type) {
      case 'pdf':
        success = await exportToPdf(tab.content, fileName, tab.filePath, settingsStore.theme)
        break
      case 'html':
        success = await exportToHtml(tab.content, fileName, tab.filePath, settingsStore.theme)
        break
      case 'word':
        success = await exportToWord(tab.content, fileName, tab.filePath, settingsStore.theme)
        break
    }

    exportStatus.value = success ? '导出成功' : '已取消'
  } catch {
    exportStatus.value = '导出失败'
  } finally {
    isExporting.value = false
    setTimeout(() => { exportStatus.value = '' }, 2000)
  }
}

const emit = defineEmits<{ close: [] }>()

function closeMenu() {
  emit('close')
}

function handleClick(type: 'pdf' | 'html' | 'word') {
  handleExport(type)
  closeMenu()
}


</script>

<template>
  <div class="export-menu">
    <div class="export-item" @click="handleClick('pdf')">
      <span class="export-icon">📄</span>
      <div class="export-info">
        <span class="export-label">导出为 PDF</span>
        <span class="export-desc">适合打印和分享</span>
      </div>
    </div>
    <div class="export-item" @click="handleClick('html')">
      <span class="export-icon">🌐</span>
      <div class="export-info">
        <span class="export-label">导出为 HTML</span>
        <span class="export-desc">独立网页文件</span>
      </div>
    </div>
    <div class="export-item" @click="handleClick('word')">
      <span class="export-icon">📝</span>
      <div class="export-info">
        <span class="export-label">导出为 Word</span>
        <span class="export-desc">Office 文档格式</span>
      </div>
    </div>
    <div v-if="exportStatus" class="export-status">{{ exportStatus }}</div>
  </div>
</template>

<style scoped>
.export-menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 200;
  min-width: 220px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 4px 0;
  box-shadow: var(--shadow-md);
}

.export-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.export-item:hover {
  background: var(--bg-hover);
}

.export-icon {
  font-size: 18px;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.export-info {
  display: flex;
  flex-direction: column;
}

.export-label {
  font-size: 13px;
  color: var(--text-primary);
}

.export-desc {
  font-size: 11px;
  color: var(--text-muted);
}

.export-status {
  padding: 6px 16px;
  font-size: 11px;
  color: var(--accent-color);
  text-align: center;
  border-top: 1px solid var(--border-light);
  margin-top: 2px;
}
</style>
