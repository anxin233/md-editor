<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useFileStore } from '@/stores/file'

const fileStore = useFileStore()

const contextMenu = ref<{ visible: boolean; x: number; y: number; tabId: string | null }>({
  visible: false, x: 0, y: 0, tabId: null,
})
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
  const menuWidth = 160
  const menuHeight = 160
  const x = Math.min(e.clientX, window.innerWidth - menuWidth)
  const y = Math.min(e.clientY, window.innerHeight - menuHeight)
  contextMenu.value = { visible: true, x, y, tabId }
  window.addEventListener('click', closeContextMenu, { once: true })
  window.addEventListener('keydown', onEscapeClose, { once: true })
}

function closeContextMenu() {
  contextMenu.value.visible = false
  window.removeEventListener('click', closeContextMenu)
  window.removeEventListener('keydown', onEscapeClose)
}

function onEscapeClose(e: KeyboardEvent) {
  if (e.key === 'Escape') closeContextMenu()
}

onUnmounted(() => {
  window.removeEventListener('click', closeContextMenu)
  window.removeEventListener('keydown', onEscapeClose)
})

function closeThisTab() {
  if (contextMenu.value.tabId) {
    confirmAndClose(contextMenu.value.tabId)
  }
  closeContextMenu()
}

function closeOtherTabs() {
  const keepId = contextMenu.value.tabId
  if (!keepId) return
  const idsToClose = fileStore.tabs.filter(t => t.id !== keepId).map(t => t.id)
  const dirtyCount = idsToClose.filter(id => fileStore.isTabDirty(id)).length
  for (const id of idsToClose) {
    if (fileStore.isTabDirty(id)) continue
    fileStore.closeTab(id)
  }
  if (dirtyCount > 0) {
    window.alert(`${dirtyCount} 个未保存的标签页已保留`)
  }
  closeContextMenu()
}

function closeAllTabs() {
  const hasDirty = fileStore.tabs.some(t => fileStore.isTabDirty(t.id))
  if (hasDirty) {
    const confirmed = window.confirm('有文件未保存，确定全部关闭吗？')
    if (!confirmed) return
  }
  const ids = fileStore.tabs.map(t => t.id)
  for (const id of ids) {
    fileStore.closeTab(id)
  }
  closeContextMenu()
}

function closeSavedTabs() {
  const idsToClose = fileStore.tabs.filter(t => !fileStore.isTabDirty(t.id)).map(t => t.id)
  for (const id of idsToClose) {
    fileStore.closeTab(id)
  }
  closeContextMenu()
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

    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <div class="context-item" @click="closeThisTab">关闭</div>
        <div class="context-item" @click="closeOtherTabs">关闭其他</div>
        <div class="context-item" @click="closeSavedTabs">关闭已保存</div>
        <div class="context-divider"></div>
        <div class="context-item" @click="closeAllTabs">关闭全部</div>
      </div>
    </Teleport>
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
  border-right: 1px solid var(--tab-border);
  background: var(--tab-inactive-bg);
  cursor: pointer;
  white-space: nowrap;
  min-width: 100px;
  max-width: 200px;
  font-size: var(--font-size-small);
  color: var(--text-secondary);
  transition: background var(--transition-fast);
  flex-shrink: 0;
}

.tab:hover {
  background: var(--bg-hover);
}

.tab.active {
  background: var(--tab-active-bg);
  color: var(--text-primary);
  border-bottom: 2px solid var(--accent-color);
}

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.tab-dirty {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}

.tab.active .tab-dirty {
  background: var(--accent-color);
}

.tab-close {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  opacity: 0;
  flex-shrink: 0;
  transition: all var(--transition-fast);
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: var(--bg-active);
  color: var(--text-primary);
}
</style>
