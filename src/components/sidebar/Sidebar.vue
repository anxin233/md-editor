<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useFileStore } from '@/stores/file'
import FileTree from './FileTree.vue'

const settingsStore = useSettingsStore()
const fileStore = useFileStore()
const fileTreeRef = ref<InstanceType<typeof FileTree>>()
const showRecentFiles = ref(false)

async function openFolder() {
  const folderPath = await window.electronAPI?.dialog.openFolder()
  if (folderPath) {
    fileStore.workspacePath = folderPath
  }
}

async function openFile() {
  const filePath = await window.electronAPI?.dialog.openFile()
  if (!filePath) return

  const opened = await fileStore.openPath(filePath)
  if (!opened) return
  settingsStore.addRecentFile(filePath, opened.fileName)
}

function newFile() {
  fileStore.createNewTab()
}

async function onTreeOpenFile(path: string) {
  try {
    const opened = await fileStore.openPath(path)
    if (!opened) return
    settingsStore.addRecentFile(path, opened.fileName)
  } catch (err) {
    console.error('Failed to open file:', err)
  }
}

async function openRecentFile(filePath: string) {
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

function refreshTree() {
  fileTreeRef.value?.refresh()
}
</script>

<template>
  <div v-if="settingsStore.showSidebar" class="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">资源管理器</span>
      <button
        class="collapse-btn"
        @click="settingsStore.toggleSidebar()"
        title="折叠资源管理器 (Ctrl+Shift+B)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.646 11.354a.5.5 0 0 1 0-.708L7.293 7 3.646 3.354a.5.5 0 1 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708 0z" transform="scale(-1,1) translate(-16,0)"/>
        </svg>
      </button>
    </div>

    <div class="sidebar-actions">
      <button class="action-btn" @click="newFile" title="新建文件 (Ctrl+N)">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a.5.5 0 0 1 .5.5V7h5.5a.5.5 0 0 1 0 1H8.5v5.5a.5.5 0 0 1-1 0V8H2a.5.5 0 0 1 0-1h5.5V1.5A.5.5 0 0 1 8 1z"/>
        </svg>
      </button>
      <button class="action-btn" @click="openFile" title="打开文件 (Ctrl+O)">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
        </svg>
      </button>
      <button class="action-btn" @click="openFolder" title="打开文件夹">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31L2.5 3h7.328zM2.5 5l-.453.696a1 1 0 0 0-.172.655l.636 7a1 1 0 0 0 .996.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 14.5 5h-12z"/>
        </svg>
      </button>
      <button v-if="fileStore.workspacePath" class="action-btn" @click="refreshTree" title="刷新">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
          <path d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
        </svg>
      </button>
    </div>

    <div class="sidebar-content">
      <div v-if="!fileStore.workspacePath" class="empty-state">
        <p>尚未打开文件夹</p>
        <button class="open-folder-btn" @click="openFolder">打开文件夹</button>
      </div>
      <div v-else class="file-tree-container">
        <div class="workspace-header" @click="refreshTree">
          <span class="workspace-name">{{ fileStore.workspacePath.split(/[\\/]/).pop() }}</span>
        </div>
        <FileTree
          ref="fileTreeRef"
          :rootPath="fileStore.workspacePath"
          :activeFilePath="fileStore.activeTab?.filePath || null"
          @openFile="onTreeOpenFile"
        />
      </div>

      <div v-if="settingsStore.recentFiles.length > 0" class="recent-files">
        <div class="recent-header" @click="showRecentFiles = !showRecentFiles">
          <span class="recent-arrow" :class="{ expanded: showRecentFiles }">▶</span>
          <span class="recent-title">最近文件</span>
          <span class="recent-count">{{ settingsStore.recentFiles.length }}</span>
          <button
            class="recent-clear-btn"
            @click.stop="settingsStore.clearRecentFiles()"
            title="清除记录"
          >×</button>
        </div>
        <div v-if="showRecentFiles" class="recent-list">
          <div
            v-for="file in settingsStore.recentFiles"
            :key="file.path"
            class="recent-item"
            :title="file.path"
            @click="openRecentFile(file.path)"
          >
            <span class="recent-name">{{ file.name }}</span>
            <span class="recent-path">{{ file.path }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-min-width);
  max-width: var(--sidebar-max-width);
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-header {
  height: var(--tabbar-height);
  display: flex;
  align-items: center;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--border-color);
}

.collapse-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  opacity: 0;
  transition: all var(--transition-fast);
  margin-left: auto;
}

.sidebar-header:hover .collapse-btn {
  opacity: 1;
}

.collapse-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.sidebar-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.sidebar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-light);
}

.action-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 12px;
  color: var(--text-muted);
  font-size: var(--font-size-small);
}

.open-folder-btn {
  padding: 6px 16px;
  background: var(--accent-color);
  color: var(--accent-text);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-small);
  transition: background var(--transition-fast);
}

.open-folder-btn:hover {
  background: var(--accent-hover);
}

.file-tree-container {
  padding-top: 4px;
}

.workspace-header {
  padding: 4px 16px 4px;
  cursor: pointer;
}

.workspace-name {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.workspace-header:hover .workspace-name {
  color: var(--text-primary);
}

.recent-files {
  border-top: 1px solid var(--border-light);
  margin-top: 4px;
}

.recent-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  cursor: pointer;
  user-select: none;
}

.recent-header:hover {
  background: var(--bg-hover);
}

.recent-arrow {
  font-size: 8px;
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}

.recent-arrow.expanded {
  transform: rotate(90deg);
}

.recent-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  flex: 1;
}

.recent-count {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 8px;
}

.recent-clear-btn {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: all var(--transition-fast);
}

.recent-header:hover .recent-clear-btn {
  opacity: 1;
}

.recent-clear-btn:hover {
  background: var(--bg-active);
  color: var(--danger-color);
}

.recent-list {
  max-height: 200px;
  overflow-y: auto;
}

.recent-item {
  display: flex;
  flex-direction: column;
  padding: 4px 16px 4px 28px;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.recent-item:hover {
  background: var(--bg-hover);
}

.recent-name {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-path {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: rtl;
  text-align: left;
}
</style>
