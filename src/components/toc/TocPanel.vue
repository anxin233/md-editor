<script setup lang="ts">
import { computed } from 'vue'
import { useFileStore } from '@/stores/file'
import { useEditorStore } from '@/stores/editor'

interface TocItem {
  level: number
  text: string
  line: number
}

const fileStore = useFileStore()
const editorStore = useEditorStore()

const headings = computed<TocItem[]>(() => {
  const content = fileStore.activeTab?.content || ''
  if (!content) return []

  const items: TocItem[] = []
  const lines = content.split('\n')
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const trimmedLine = line.trimStart()
    if (trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      items.push({
        level: match[1].length,
        text: match[2].replace(/[#*`\[\]()]/g, '').trim(),
        line: i + 1,
      })
    }
  }

  return items
})

const minLevel = computed(() => {
  if (headings.value.length === 0) return 1
  return Math.min(...headings.value.map(h => h.level))
})

const activeHeadingIndex = computed(() => {
  const items = headings.value
  if (items.length === 0) return -1

  let activeIndex = 0
  for (let i = 0; i < items.length; i++) {
    if (editorStore.cursorLine >= items[i].line) {
      activeIndex = i
    } else {
      break
    }
  }
  return activeIndex
})

function scrollToHeading(item: TocItem) {
  editorStore.requestScrollToLine(item.line)
}
</script>

<template>
  <div class="toc-panel">
    <div class="toc-header">
      <span class="toc-title">大纲</span>
      <span class="toc-count" v-if="headings.length">{{ headings.length }}</span>
    </div>
    <div class="toc-content">
      <template v-if="!fileStore.activeTab">
        <p class="toc-empty">无打开的文件</p>
      </template>
      <template v-else-if="headings.length === 0">
        <p class="toc-empty">暂无标题</p>
      </template>
      <template v-else>
        <div
          v-for="(item, idx) in headings"
          :key="idx"
          class="toc-item"
          :class="[{ active: idx === activeHeadingIndex }, `toc-level-${item.level}`]"
          :style="{ paddingLeft: (item.level - minLevel) * 16 + 12 + 'px' }"
          :title="item.text"
          @click="scrollToHeading(item)"
        >
          <span class="toc-indicator" :class="[`h${item.level}`]">H{{ item.level }}</span>
          <span class="toc-text">{{ item.text }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.toc-panel {
  width: var(--toc-width);
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.toc-header {
  height: var(--tabbar-height);
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color);
  gap: 8px;
}

.toc-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.toc-count {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 8px;
}

.toc-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.toc-empty {
  font-size: var(--font-size-small);
  color: var(--text-muted);
  text-align: center;
  padding-top: 20px;
}

.toc-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toc-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toc-item.active {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toc-indicator {
  font-size: 9px;
  font-weight: 700;
  font-family: var(--font-family-mono);
  padding: 1px 3px;
  border-radius: 2px;
  flex-shrink: 0;
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.toc-indicator.h1 { color: var(--accent-color); }
.toc-indicator.h2 { color: var(--accent-color); opacity: 0.8; }

.toc-text {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
