<script setup lang="ts">
import { ref, computed } from 'vue'

export interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: TreeNode[]
}

const props = defineProps<{
  node: TreeNode
  depth: number
  activeFilePath: string | null
}>()

const emit = defineEmits<{
  openFile: [path: string]
  contextMenu: [event: MouseEvent, node: TreeNode]
}>()

const expanded = ref(false)
const children = ref<TreeNode[]>([])
const loaded = ref(false)

const isMarkdown = computed(() => {
  if (props.node.isDirectory) return false
  return /\.(md|markdown|mdown|mkd)$/i.test(props.node.name)
})

const isActive = computed(() => {
  return props.activeFilePath === props.node.path
})

const indentStyle = computed(() => ({
  paddingLeft: `${12 + props.depth * 16}px`
}))

async function toggle() {
  if (!props.node.isDirectory) {
    emit('openFile', props.node.path)
    return
  }

  expanded.value = !expanded.value

  if (expanded.value && !loaded.value) {
    await loadChildren()
  }
}

async function loadChildren() {
  try {
    const items = await window.electronAPI?.file.readDir(props.node.path) ?? []
    children.value = items
    loaded.value = true
  } catch {
    children.value = []
    loaded.value = true
  }
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  emit('contextMenu', e, props.node)
}

async function refresh() {
  if (props.node.isDirectory && loaded.value) {
    await loadChildren()
  }
}

defineExpose({ refresh })
</script>

<template>
  <div class="tree-item-wrapper">
    <div
      class="tree-item"
      :class="{ active: isActive, directory: node.isDirectory }"
      :style="indentStyle"
      @click="toggle"
      @contextmenu="onContextMenu"
    >
      <!-- 展开/折叠箭头 -->
      <span v-if="node.isDirectory" class="tree-arrow" :class="{ expanded }">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M3 2l5 3-5 3z"/>
        </svg>
      </span>
      <span v-else class="tree-arrow-placeholder"></span>

      <!-- 图标 -->
      <span class="tree-icon">
        <svg v-if="node.isDirectory && expanded" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="icon-folder-open">
          <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v.5H2.5A1.5 1.5 0 0 0 1 7.5V3.5z"/>
          <path d="M1.5 8h12.043a1.5 1.5 0 0 1 1.467 1.812l-.69 3.45A1.5 1.5 0 0 1 12.86 14.5H3.14a1.5 1.5 0 0 1-1.46-1.238l-.69-3.45A1.5 1.5 0 0 1 1.5 8z"/>
        </svg>
        <svg v-else-if="node.isDirectory" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="icon-folder">
          <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/>
        </svg>
        <svg v-else-if="isMarkdown" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="icon-md">
          <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
          <path d="M4.5 12V7h1l1 2.5L7.5 7h1v5h-1V8.8l-.9 2.2H6l-.9-2.1V12h-1z"/>
          <path d="M9.5 12V7h1v2.5l1.5-2.5h1.2l-1.7 2.5 1.7 2.5h-1.2l-1.5-2.5V12h-1z"/>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="currentColor" class="icon-file">
          <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
        </svg>
      </span>

      <!-- 文件名 -->
      <span class="tree-name" :class="{ 'md-file': isMarkdown }">{{ node.name }}</span>
    </div>

    <!-- 子节点 -->
    <div v-if="node.isDirectory && expanded" class="tree-children">
      <FileTreeItem
        v-for="child in children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :activeFilePath="activeFilePath"
        @openFile="(p) => emit('openFile', p)"
        @contextMenu="(e, n) => emit('contextMenu', e, n)"
      />
      <div v-if="loaded && children.length === 0" class="tree-empty" :style="{ paddingLeft: `${12 + (depth + 1) * 16}px` }">
        空文件夹
      </div>
    </div>
  </div>
</template>

<style scoped>
.tree-item {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding-right: 8px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text-primary);
  transition: background var(--transition-fast);
  user-select: none;
}

.tree-item:hover {
  background: var(--bg-hover);
}

.tree-item.active {
  background: var(--bg-selected);
}

.tree-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}

.tree-arrow.expanded {
  transform: rotate(90deg);
}

.tree-arrow-placeholder {
  width: 16px;
  flex-shrink: 0;
}

.tree-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-folder, .icon-folder-open {
  color: #dcb67a;
}

.icon-md {
  color: var(--accent-color);
}

.icon-file {
  color: var(--text-muted);
}

.tree-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-name.md-file {
  color: var(--text-primary);
}

.tree-empty {
  height: 24px;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}
</style>
