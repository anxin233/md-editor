<script setup lang="ts">
import { onUnmounted } from 'vue'
import { useFileStore } from '@/stores/file'
import { useContextMenuStore, type ContextMenuEntry } from '@/stores/contextMenu'

const fileStore = useFileStore()
const contextMenuStore = useContextMenuStore()
let dragTabId: string | null = null

function isTabDirty(tabId: string) {
  return fileStore.isTabDirty(tabId)
}

function confirmAndClose(tabId: string) {
  if (fileStore.isTabDirty(tabId)) {
    const confirmed = window.confirm('文件有未保存的修改，确定要关闭吗？')
    if (!confirmed) return
  }
  fileStore.closeTab(tabId)
}

function onTabContextMenu(e: MouseEvent, tabId: string) {
  e.preventDefault()
  const tab = fileStore.tabs.find(t => t.id === tabId)
  if (!tab) return

  const items: ContextMenuEntry[] = [
    {
      id: 'save',
      label: '保存',
      action: async () => {
        await fileStore.saveTab(tabId, false)
      },
    },
    {
      id: 'close',
      label: '关闭',
      separatorBefore: true,
      action: () => confirmAndClose(tabId),
    },
    {
      id: 'close-other',
      label: '关闭其他',
      action: () => closeOtherTabsFor(tabId),
    },
    {
      id: 'copy-path',
      label: '复制文件路径',
      separatorBefore: true,
      disabled: !tab.filePath,
      action: async () => {
        if (!tab.filePath) return
        try {
          await navigator.clipboard.writeText(tab.filePath)
        } catch {
          // ignore
        }
      },
    },
  ]

  contextMenuStore.show({
    clientX: e.clientX,
    clientY: e.clientY,
    items,
  })
}

function closeOtherTabsFor(keepId: string) {
  const idsToClose = fileStore.tabs.filter(t => t.id !== keepId).map(t => t.id)
  const dirtyCount = idsToClose.filter(id => fileStore.isTabDirty(id)).length
  for (const id of idsToClose) {
    if (fileStore.isTabDirty(id)) continue
    fileStore.closeTab(id)
  }
  if (dirtyCount > 0) {
    window.alert(`${dirtyCount} 个未保存的标签页已保留`)
  }
}

function onDragStart(e: DragEvent, tabId: string) {
  dragTabId = tabId
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
}

function onDrop(e: DragEvent, targetTabId: string) {
  e.preventDefault()
  if (!dragTabId || dragTabId === targetTabId) return

  const fromIdx = fileStore.tabs.findIndex(t => t.id === dragTabId)
  const toIdx = fileStore.tabs.findIndex(t => t.id === targetTabId)
  if (fromIdx === -1 || toIdx === -1) return

  const [tab] = fileStore.tabs.splice(fromIdx, 1)
  fileStore.tabs.splice(toIdx, 0, tab)
  dragTabId = null
}

function onDragEnd() {
  dragTabId = null
}

onUnmounted(() => {
  contextMenuStore.hide()
})
</script>

<template>
  <div v-if="fileStore.tabs.length > 0" class="tabbar">
    <div class="tabs-scroll">
      <div
        v-for="tab in fileStore.tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === fileStore.activeTabId }"
        @click="fileStore.setActiveTab(tab.id)"
        @mousedown.middle.prevent="confirmAndClose(tab.id)"
        @contextmenu.prevent="onTabContextMenu($event, tab.id)"
        draggable="true"
        @dragstart="onDragStart($event, tab.id)"
        @dragover="onDragOver"
        @drop="onDrop($event, tab.id)"
        @dragend="onDragEnd"
      >
        <span class="tab-name">{{ tab.fileName }}</span>
        <span v-if="isTabDirty(tab.id)" class="tab-dirty"></span>
        <button
          type="button"
          class="tab-close"
          @click.stop="confirmAndClose(tab.id)"
          title="关闭"
        >
          <svg width="8" height="8" viewBox="0 0 8 8">
            <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" stroke-width="1.2"/>
            <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" stroke-width="1.2"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tabbar {
  height: var(--tabbar-height);
  background: var(--tab-inactive-bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: flex-end;
  flex-shrink: 0;
  overflow: hidden;
}

.tabs-scroll {
  display: flex;
  overflow-x: auto;
  height: 100%;
  align-items: flex-end;
}

.tabs-scroll::-webkit-scrollbar {
  height: 0;
}

.tab {
  height: calc(100% - 1px);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  min-width: 80px;
  max-width: 200px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all var(--transition-fast);
}

.tab:hover {
  background: var(--bg-hover);
}

.tab.active {
  color: var(--text-primary);
  background: var(--bg-primary);
  border-bottom-color: var(--accent-color);
}

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-dirty {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-color);
  flex-shrink: 0;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  opacity: 0.5;
  color: inherit;
  background: transparent;
  border: none;
  cursor: pointer;
}

.tab-close:hover {
  opacity: 1;
  background: var(--bg-active);
}
</style>
