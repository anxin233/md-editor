<script setup lang="ts">
import { ref, watch } from 'vue'
import FileTreeItem, { type TreeNode } from './FileTreeItem.vue'
import { useFileStore } from '@/stores/file'
import { useContextMenuStore, type ContextMenuEntry } from '@/stores/contextMenu'

const props = defineProps<{
  rootPath: string
  activeFilePath: string | null
}>()

const emit = defineEmits<{
  openFile: [path: string]
}>()

const fileStore = useFileStore()
const contextMenuStore = useContextMenuStore()
const rootNodes = ref<TreeNode[]>([])
const treeLoaded = ref(false)
const isRenaming = ref(false)
const renameValue = ref('')
const renameTarget = ref<TreeNode | null>(null)
const isCreating = ref<'file' | 'dir' | null>(null)
const createValue = ref('')
const createParentPath = ref('')

watch(() => props.rootPath, async (path) => {
  if (path) await loadRoot(path)
}, { immediate: true })

async function loadRoot(path: string) {
  treeLoaded.value = false
  try {
    rootNodes.value = await window.electronAPI?.file.readDir(path) ?? []
  } catch {
    rootNodes.value = []
  }
  treeLoaded.value = true
}

function onOpenFile(path: string) {
  emit('openFile', path)
}

function isInvalidNodeName(name: string): boolean {
  return /[\\/]/.test(name) || name === '.' || name === '..'
}

function parentDirOf(filePath: string): string {
  const i = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return i <= 0 ? filePath : filePath.substring(0, i)
}

function beginRename(node: TreeNode) {
  renameTarget.value = node
  renameValue.value = node.name
  isRenaming.value = true
}

function beginCreate(type: 'file' | 'dir', node: TreeNode | null) {
  createParentPath.value = node
    ? (node.isDirectory ? node.path : parentDirOf(node.path))
    : props.rootPath
  isCreating.value = type
  createValue.value = type === 'file' ? '未命名.md' : '新建文件夹'
}

function onNodeContextMenu(event: MouseEvent, node: TreeNode) {
  event.preventDefault()
  const items: ContextMenuEntry[] = []

  if (!node.isDirectory) {
    items.push(
      { id: 'open', label: '打开', action: () => onOpenFile(node.path) },
      {
        id: 'rename',
        label: '重命名',
        separatorBefore: true,
        action: () => beginRename(node),
      },
      {
        id: 'del',
        label: '删除',
        danger: true,
        action: () => void deleteNodeAt(node),
      },
      {
        id: 'refresh',
        label: '刷新',
        separatorBefore: true,
        action: () => void loadRoot(props.rootPath),
      },
      {
        id: 'copy',
        label: '复制路径',
        action: async () => {
          try {
            await navigator.clipboard.writeText(node.path)
          } catch {
            // ignore
          }
        },
      },
    )
  } else {
    items.push(
      { id: 'nf', label: '新建文件', action: () => beginCreate('file', node) },
      { id: 'nd', label: '新建文件夹', action: () => beginCreate('dir', node) },
      {
        id: 'rename',
        label: '重命名',
        separatorBefore: true,
        action: () => beginRename(node),
      },
      {
        id: 'del',
        label: '删除',
        danger: true,
        action: () => void deleteNodeAt(node),
      },
      {
        id: 'refresh',
        label: '刷新',
        separatorBefore: true,
        action: () => void loadRoot(props.rootPath),
      },
      {
        id: 'copy',
        label: '复制路径',
        action: async () => {
          try {
            await navigator.clipboard.writeText(node.path)
          } catch {
            // ignore
          }
        },
      },
    )
  }

  contextMenuStore.show({
    clientX: event.clientX,
    clientY: event.clientY,
    items,
  })
}

function onEmptyTreeContextMenu(e: MouseEvent) {
  e.preventDefault()
  contextMenuStore.show({
    clientX: e.clientX,
    clientY: e.clientY,
    items: [
      { id: 'nf', label: '新建文件', action: () => beginCreate('file', null) },
      { id: 'nd', label: '新建文件夹', action: () => beginCreate('dir', null) },
      {
        id: 'ref',
        label: '刷新',
        separatorBefore: true,
        action: () => void loadRoot(props.rootPath),
      },
    ],
  })
}

async function confirmRename() {
  const nextName = renameValue.value.trim()
  if (!renameTarget.value || !nextName) {
    cancelRename()
    return
  }
  if (isInvalidNodeName(nextName)) return

  const oldPath = renameTarget.value.path
  const parentDir = oldPath.substring(0, oldPath.lastIndexOf('\\') !== -1 ? oldPath.lastIndexOf('\\') : oldPath.lastIndexOf('/'))
  const sep = oldPath.includes('\\') ? '\\' : '/'
  const newPath = parentDir + sep + nextName

  if (oldPath !== newPath) {
    try {
      await window.electronAPI?.file.rename(oldPath, newPath)
      fileStore.renameTabsInPath(oldPath, newPath)
      await loadRoot(props.rootPath)
    } catch (err) {
      console.error('Rename failed:', err)
    }
  }
  cancelRename()
}

function cancelRename() {
  isRenaming.value = false
  renameTarget.value = null
  renameValue.value = ''
}

async function confirmCreate() {
  const nextName = createValue.value.trim()
  if (!isCreating.value || !nextName) {
    cancelCreate()
    return
  }
  if (isInvalidNodeName(nextName)) return

  const sep = createParentPath.value.includes('\\') ? '\\' : '/'
  const newPath = createParentPath.value + sep + nextName

  try {
    if (isCreating.value === 'file') {
      await window.electronAPI?.file.createFile(newPath)
    } else {
      await window.electronAPI?.file.createDir(newPath)
    }
    await loadRoot(props.rootPath)
  } catch (err) {
    console.error('Create failed:', err)
  }
  cancelCreate()
}

function cancelCreate() {
  isCreating.value = null
  createValue.value = ''
  createParentPath.value = ''
}

/** 先主进程删除成功，再关标签（与方案 08 一致） */
async function deleteNodeAt(node: TreeNode) {
  const dirtyTabs = fileStore.tabs.filter(tab => {
    return tab.filePath && (tab.filePath === node.path || tab.filePath.replace(/\\/g, '/').startsWith(node.path.replace(/\\/g, '/') + '/'))
  })
  if (dirtyTabs.some(tab => fileStore.isTabDirty(tab.id))) {
    const confirmed = window.confirm('该节点下有未保存的文件修改，确定要删除吗？')
    if (!confirmed) return
  }

  try {
    await window.electronAPI?.file.delete(node.path)
    fileStore.closeTabsInPath(node.path)
    await loadRoot(props.rootPath)
  } catch (err) {
    console.error('Delete failed:', err)
    window.alert('删除失败，请检查权限或文件是否被占用')
  }
}

defineExpose({ refresh: () => loadRoot(props.rootPath) })
</script>

<template>
  <div class="file-tree" @contextmenu.self.prevent="onEmptyTreeContextMenu">
    <FileTreeItem
      v-for="node in rootNodes"
      :key="node.path"
      :node="node"
      :depth="0"
      :activeFilePath="activeFilePath"
      @openFile="onOpenFile"
      @contextMenu="onNodeContextMenu"
    />

    <div v-if="!treeLoaded" class="tree-loading">加载中...</div>
    <div v-else-if="rootNodes.length === 0" class="tree-loading">空文件夹（可在空白处右键）</div>

    <div v-if="isRenaming" class="inline-input-overlay" @click.self="cancelRename">
      <div class="inline-input-box">
        <label class="inline-label">重命名</label>
        <input
          v-model="renameValue"
          class="inline-input"
          @keydown.enter="confirmRename"
          @keydown.escape="cancelRename"
          autofocus
        />
        <div class="inline-actions">
          <button type="button" class="inline-btn confirm" @click="confirmRename">确认</button>
          <button type="button" class="inline-btn cancel" @click="cancelRename">取消</button>
        </div>
      </div>
    </div>

    <div v-if="isCreating" class="inline-input-overlay" @click.self="cancelCreate">
      <div class="inline-input-box">
        <label class="inline-label">{{ isCreating === 'file' ? '新建文件' : '新建文件夹' }}</label>
        <input
          v-model="createValue"
          class="inline-input"
          @keydown.enter="confirmCreate"
          @keydown.escape="cancelCreate"
          autofocus
        />
        <div class="inline-actions">
          <button type="button" class="inline-btn confirm" @click="confirmCreate">确认</button>
          <button type="button" class="inline-btn cancel" @click="cancelCreate">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-tree {
  position: relative;
  min-height: 120px;
}

.tree-loading {
  padding: 12px 16px;
  font-size: 12px;
  color: var(--text-muted);
}

.inline-input-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.3);
}

.inline-input-box {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
  min-width: 300px;
  box-shadow: var(--shadow-md);
}

.inline-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.inline-input {
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-primary);
  outline: none;
}

.inline-input:focus {
  border-color: var(--accent-color);
}

.inline-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.inline-btn {
  padding: 4px 14px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.inline-btn.confirm {
  background: var(--accent-color);
  color: var(--accent-text);
}

.inline-btn.confirm:hover {
  background: var(--accent-hover);
}

.inline-btn.cancel {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.inline-btn.cancel:hover {
  background: var(--bg-active);
}
</style>
