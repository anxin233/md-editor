<script setup lang="ts">
import { ref, watch } from 'vue'
import FileTreeItem, { type TreeNode } from './FileTreeItem.vue'
import { useFileStore } from '@/stores/file'

const props = defineProps<{
  rootPath: string
  activeFilePath: string | null
}>()

const emit = defineEmits<{
  openFile: [path: string]
}>()

const fileStore = useFileStore()
const rootNodes = ref<TreeNode[]>([])
const treeLoaded = ref(false)
const contextMenu = ref<{ visible: boolean; x: number; y: number; node: TreeNode | null }>({
  visible: false, x: 0, y: 0, node: null,
})
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

function onContextMenu(event: MouseEvent, node: TreeNode) {
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, node }
  window.addEventListener('click', closeContextMenu, { once: true })
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function startRename() {
  if (!contextMenu.value.node) return
  renameTarget.value = contextMenu.value.node
  renameValue.value = contextMenu.value.node.name
  isRenaming.value = true
  closeContextMenu()
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

function startCreate(type: 'file' | 'dir') {
  const node = contextMenu.value.node
  if (!node) return

  createParentPath.value = node.isDirectory ? node.path : node.path.substring(0, Math.max(node.path.lastIndexOf('\\'), node.path.lastIndexOf('/')))
  isCreating.value = type
  createValue.value = type === 'file' ? '未命名.md' : '新建文件夹'
  closeContextMenu()
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

async function deleteNode() {
  const node = contextMenu.value.node
  if (!node) return
  closeContextMenu()

  const dirtyTabs = fileStore.tabs.filter(tab => {
    return tab.filePath && (tab.filePath === node.path || tab.filePath.replace(/\\/g, '/').startsWith(node.path.replace(/\\/g, '/') + '/'))
  })
  if (dirtyTabs.some(tab => fileStore.isTabDirty(tab.id))) {
    const confirmed = window.confirm('该节点下有未保存的文件修改，确定要删除吗？')
    if (!confirmed) return
  }

  try {
    fileStore.closeTabsInPath(node.path)
    await window.electronAPI?.file.delete(node.path)
    await loadRoot(props.rootPath)
  } catch (err) {
    console.error('Delete failed:', err)
  }
}

async function refresh() {
  await loadRoot(props.rootPath)
}

defineExpose({ refresh })
</script>

<template>
  <div class="file-tree">
    <FileTreeItem
      v-for="node in rootNodes"
      :key="node.path"
      :node="node"
      :depth="0"
      :activeFilePath="activeFilePath"
      @openFile="onOpenFile"
      @contextMenu="onContextMenu"
    />

    <div v-if="!treeLoaded" class="tree-loading">加载中...</div>
    <div v-else-if="rootNodes.length === 0" class="tree-loading">空文件夹</div>

    <!-- 重命名弹窗 -->
    <div v-if="isRenaming" class="inline-input-overlay" @click.self="cancelRename">
      <div class="inline-input-box">
        <label class="inline-label">重命名</label>
        <input
          v-model="renameValue"
          class="inline-input"
          @keydown.enter="confirmRename"
          @keydown.escape="cancelRename"
          ref="renameInput"
          autofocus
        />
        <div class="inline-actions">
          <button class="inline-btn confirm" @click="confirmRename">确认</button>
          <button class="inline-btn cancel" @click="cancelRename">取消</button>
        </div>
      </div>
    </div>

    <!-- 新建弹窗 -->
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
          <button class="inline-btn confirm" @click="confirmCreate">确认</button>
          <button class="inline-btn cancel" @click="cancelCreate">取消</button>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <div class="context-item" @click="startCreate('file')">新建文件</div>
        <div class="context-item" @click="startCreate('dir')">新建文件夹</div>
        <div class="context-divider"></div>
        <div class="context-item" @click="startRename">重命名</div>
        <div class="context-item danger" @click="deleteNode">删除</div>
        <div class="context-divider"></div>
        <div class="context-item" @click="refresh(); closeContextMenu()">刷新</div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.file-tree {
  position: relative;
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

