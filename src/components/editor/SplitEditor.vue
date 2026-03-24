<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import MarkdownSource from './MarkdownSource.vue'
import MarkdownPreview from './MarkdownPreview.vue'

defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const syncScrollRatio = ref<number>()
const dividerRef = ref<HTMLDivElement>()
const sourceRef = ref<InstanceType<typeof MarkdownSource>>()
const splitPercent = ref(50)
let isDragging = false
let scrollSource: 'editor' | 'preview' | null = null
let scrollTimeout: ReturnType<typeof setTimeout> | null = null

function onUpdate(value: string) {
  emit('update:modelValue', value)
}

function onEditorScroll(info: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
  if (scrollSource === 'preview') return
  scrollSource = 'editor'
  const maxScroll = Math.max(0, info.scrollHeight - info.clientHeight)
  syncScrollRatio.value = maxScroll > 0 ? info.scrollTop / maxScroll : 0
  clearScrollSource()
}

function onPreviewScroll(info: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
  if (scrollSource === 'editor') return
  scrollSource = 'preview'
  const maxScroll = Math.max(0, info.scrollHeight - info.clientHeight)
  const ratio = maxScroll > 0 ? info.scrollTop / maxScroll : 0

  const view = sourceRef.value?.getView()
  if (view) {
    const editorMaxScroll = Math.max(0, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight)
    view.scrollDOM.scrollTop = editorMaxScroll * ratio
  }

  clearScrollSource()
}

function clearScrollSource() {
  if (scrollTimeout) clearTimeout(scrollTimeout)
  scrollTimeout = setTimeout(() => { scrollSource = null }, 100)
}

function startDrag(e: MouseEvent) {
  isDragging = true
  e.preventDefault()
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(e: MouseEvent) {
  if (!isDragging || !dividerRef.value) return
  const container = dividerRef.value.parentElement
  if (!container) return
  const rect = container.getBoundingClientRect()
  const percent = ((e.clientX - rect.left) / rect.width) * 100
  splitPercent.value = Math.max(25, Math.min(75, percent))
}

function stopDrag() {
  isDragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

onUnmounted(() => {
  if (scrollTimeout) clearTimeout(scrollTimeout)
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
})

defineExpose({
  sourceRef,
  getSourceEditor: () => sourceRef.value,
})
</script>

<template>
  <div class="split-editor">
    <div class="split-pane editor-pane" :style="{ width: splitPercent + '%' }">
      <MarkdownSource
        ref="sourceRef"
        :modelValue="modelValue"
        @update:modelValue="onUpdate"
        @scroll="onEditorScroll"
      />
    </div>

    <div ref="dividerRef" class="split-divider" @mousedown="startDrag">
      <div class="divider-line"></div>
    </div>

    <div class="split-pane preview-pane" :style="{ width: (100 - splitPercent) + '%' }">
      <MarkdownPreview
        :content="modelValue"
        :syncScrollRatio="syncScrollRatio"
        @scroll="onPreviewScroll"
      />
    </div>
  </div>
</template>

<style scoped>
.split-editor {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.split-pane {
  display: flex;
  overflow: hidden;
}

.split-divider {
  width: 6px;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--bg-secondary);
  transition: background var(--transition-fast);
}

.split-divider:hover {
  background: var(--accent-color);
}

.divider-line {
  width: 2px;
  height: 30px;
  background: var(--border-color);
  border-radius: 1px;
}

.split-divider:hover .divider-line {
  background: var(--accent-text);
}

.preview-pane {
  border-left: 1px solid var(--border-color);
}
</style>
