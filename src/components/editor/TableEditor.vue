<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useEditorStore } from '@/stores/editor'

const emit = defineEmits<{
  close: []
}>()

const editorStore = useEditorStore()

const rows = ref(3)
const cols = ref(3)
const cells = ref<string[][]>([])
const alignments = ref<('left' | 'center' | 'right')[]>([])

function initCells() {
  const newCells: string[][] = []
  for (let r = 0; r <= rows.value; r++) {
    const row: string[] = []
    for (let c = 0; c < cols.value; c++) {
      row.push(cells.value[r]?.[c] || '')
    }
    newCells.push(row)
  }
  cells.value = newCells

  const newAligns: ('left' | 'center' | 'right')[] = []
  for (let c = 0; c < cols.value; c++) {
    newAligns.push(alignments.value[c] || 'left')
  }
  alignments.value = newAligns
}

initCells()
watch([rows, cols], () => initCells())

function cycleAlignment(colIdx: number) {
  const order: ('left' | 'center' | 'right')[] = ['left', 'center', 'right']
  const current = alignments.value[colIdx]
  const nextIdx = (order.indexOf(current) + 1) % order.length
  alignments.value[colIdx] = order[nextIdx]
}

const alignmentLabels: Record<string, string> = {
  left: '左',
  center: '中',
  right: '右',
}

function generateMarkdown(): string {
  const headerRow = cells.value[0]
  const dataRows = cells.value.slice(1)

  const colWidths: number[] = []
  for (let c = 0; c < cols.value; c++) {
    let maxWidth = 3
    for (let r = 0; r <= rows.value; r++) {
      maxWidth = Math.max(maxWidth, (cells.value[r]?.[c] || '').length)
    }
    colWidths.push(maxWidth)
  }

  function padCell(text: string, width: number): string {
    return text.padEnd(width)
  }

  const headerLine = '| ' + headerRow.map((cell, i) => padCell(cell || `列${i + 1}`, colWidths[i])).join(' | ') + ' |'

  const separatorLine = '| ' + alignments.value.map((align, i) => {
    const w = colWidths[i]
    if (align === 'center') return ':' + '-'.repeat(w - 2) + ':'
    if (align === 'right') return '-'.repeat(w - 1) + ':'
    return '-'.repeat(w)
  }).join(' | ') + ' |'

  const bodyLines = dataRows.map(row =>
    '| ' + row.map((cell, i) => padCell(cell || '', colWidths[i])).join(' | ') + ' |'
  )

  return [headerLine, separatorLine, ...bodyLines].join('\n')
}

function onInsert() {
  const md = generateMarkdown()
  editorStore.requestFormat('table-insert', md)
  emit('close')
}

function addRow() {
  rows.value++
}

function addCol() {
  cols.value++
}

function removeRow() {
  if (rows.value > 1) rows.value--
}

function removeCol() {
  if (cols.value > 1) cols.value--
}

const previewMarkdown = computed(() => generateMarkdown())

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    onInsert()
  }
}

function focusCell(rowIdx: number, colIdx: number) {
  nextTick(() => {
    const input = document.querySelector(
      `.table-grid input[data-row="${rowIdx}"][data-col="${colIdx}"]`
    ) as HTMLInputElement | null
    input?.focus()
  })
}

function onCellKeydown(e: KeyboardEvent, rowIdx: number, colIdx: number) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const nextCol = colIdx + 1
    if (nextCol < cols.value) {
      focusCell(rowIdx, nextCol)
    } else if (rowIdx < rows.value) {
      focusCell(rowIdx + 1, 0)
    }
  }
}
</script>

<template>
    <div class="table-editor-overlay" @click.self="emit('close')" @keydown="onKeydown">
    <div class="table-editor-dialog">
      <div class="dialog-header">
        <span class="dialog-title">插入表格</span>
        <button class="dialog-close" @click="emit('close')">×</button>
      </div>

      <div class="dialog-body">
        <div class="size-controls">
          <div class="size-group">
            <label>列数</label>
            <div class="size-buttons">
              <button @click="removeCol" :disabled="cols <= 1">−</button>
              <span class="size-value">{{ cols }}</span>
              <button @click="addCol" :disabled="cols >= 10">+</button>
            </div>
          </div>
          <div class="size-group">
            <label>行数</label>
            <div class="size-buttons">
              <button @click="removeRow" :disabled="rows <= 1">−</button>
              <span class="size-value">{{ rows }}</span>
              <button @click="addRow" :disabled="rows >= 20">+</button>
            </div>
          </div>
        </div>

        <div class="alignment-row">
          <span class="alignment-label">对齐:</span>
          <button
            v-for="(align, idx) in alignments"
            :key="idx"
            class="alignment-btn"
            :class="align"
            @click="cycleAlignment(idx)"
            :title="`列 ${idx + 1}: ${alignmentLabels[align]}对齐 (点击切换)`"
          >
            {{ alignmentLabels[align] }}
          </button>
        </div>

        <div class="table-grid-wrapper">
          <div class="table-grid">
            <div class="grid-row header-row">
              <input
                v-for="(_, cIdx) in cols"
                :key="cIdx"
                v-model="cells[0][cIdx]"
                :placeholder="`列${cIdx + 1}`"
                class="grid-cell header-cell"
                :data-row="0"
                :data-col="cIdx"
                @keydown="onCellKeydown($event, 0, cIdx)"
              />
            </div>
            <div v-for="rIdx in rows" :key="rIdx" class="grid-row">
              <input
                v-for="(_, cIdx) in cols"
                :key="cIdx"
                v-model="cells[rIdx][cIdx]"
                placeholder=""
                class="grid-cell"
                :data-row="rIdx"
                :data-col="cIdx"
                @keydown="onCellKeydown($event, rIdx, cIdx)"
              />
            </div>
          </div>
        </div>

        <details class="preview-section">
          <summary>预览 Markdown</summary>
          <pre class="preview-code">{{ previewMarkdown }}</pre>
        </details>
      </div>

      <div class="dialog-footer">
        <button class="btn btn-cancel" @click="emit('close')">取消</button>
        <button class="btn btn-primary" @click="onInsert">
          插入 <kbd>Ctrl+Enter</kbd>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.table-editor-dialog {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 640px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.dialog-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.dialog-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.dialog-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.dialog-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.size-controls {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;
}

.size-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-group label {
  font-size: 13px;
  color: var(--text-secondary);
}

.size-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.size-buttons button {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  transition: all var(--transition-fast);
}

.size-buttons button:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--accent-color);
}

.size-buttons button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.size-value {
  min-width: 24px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.alignment-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}

.alignment-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-right: 4px;
}

.alignment-btn {
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.alignment-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.alignment-btn.center { font-weight: 600; }
.alignment-btn.right { font-style: italic; }

.table-grid-wrapper {
  overflow-x: auto;
  margin-bottom: 12px;
}

.table-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: fit-content;
}

.grid-row {
  display: flex;
  gap: 2px;
}

.grid-cell {
  flex: 1;
  min-width: 80px;
  max-width: 200px;
  padding: 6px 8px;
  font-size: 13px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
  transition: border-color var(--transition-fast);
}

.grid-cell:focus {
  border-color: var(--accent-color);
}

.header-cell {
  background: var(--bg-secondary);
  font-weight: 600;
}

.preview-section {
  margin-top: 8px;
}

.preview-section summary {
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 0;
}

.preview-code {
  margin-top: 8px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-family: var(--font-family-mono);
  font-size: 12px;
  color: var(--text-primary);
  white-space: pre;
  overflow-x: auto;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}

.btn {
  padding: 6px 16px;
  font-size: 13px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-cancel {
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.btn-cancel:hover {
  background: var(--bg-hover);
}

.btn-primary {
  background: var(--accent-color);
  color: var(--accent-text);
  border: none;
}

.btn-primary:hover {
  filter: brightness(1.1);
}

.btn-primary kbd {
  font-size: 10px;
  opacity: 0.7;
  margin-left: 4px;
}
</style>
