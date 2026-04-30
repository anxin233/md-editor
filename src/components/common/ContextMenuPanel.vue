<script setup lang="ts">
import { ref } from 'vue'
import type { ContextMenuEntry } from '@/stores/contextMenu'
import { useContextMenuStore } from '@/stores/contextMenu'
import ContextMenuPanel from './ContextMenuPanel.vue'

defineProps<{
  entries: ContextMenuEntry[]
}>()

const store = useContextMenuStore()
const openChildId = ref<string | null>(null)

let leaveTimer: ReturnType<typeof setTimeout> | null = null

function cancelLeaveTimer() {
  if (leaveTimer) {
    clearTimeout(leaveTimer)
    leaveTimer = null
  }
}

function onWrapEnter(id: string) {
  cancelLeaveTimer()
  openChildId.value = id
}

function onWrapLeave() {
  cancelLeaveTimer()
  leaveTimer = setTimeout(() => {
    openChildId.value = null
    leaveTimer = null
  }, 180)
}

async function onLeafClick(entry: ContextMenuEntry) {
  if (entry.disabled || entry.children?.length) return
  if (!entry.action) return
  store.hide()
  await entry.action()
}

function toggleSubmenu(id: string) {
  openChildId.value = openChildId.value === id ? null : id
}
</script>

<template>
  <div class="ctx-panel">
    <template v-for="(it, idx) in entries" :key="it.id + '-' + idx">
      <div v-if="it.separatorBefore && idx > 0" class="ctx-separator" role="separator" />

      <div
        v-if="it.children?.length"
        class="ctx-row-wrap"
        @mouseenter="onWrapEnter(`${idx}-${it.id}`)"
        @mouseleave="onWrapLeave"
      >
        <button
          type="button"
          class="ctx-item ctx-parent"
          :class="{ isDisabled: it.disabled }"
          :disabled="it.disabled"
          role="menuitem"
          aria-haspopup="true"
          @click.prevent="toggleSubmenu(`${idx}-${it.id}`)"
        >
          <span>{{ it.label }}</span>
          <span class="ctx-chevron" aria-hidden="true">›</span>
        </button>
        <div
          v-if="openChildId === `${idx}-${it.id}` && !it.disabled"
          class="ctx-flyout"
          @mouseenter="cancelLeaveTimer"
          @mouseleave="onWrapLeave"
        >
          <ContextMenuPanel :entries="it.children" />
        </div>
      </div>

      <button
        v-else
        type="button"
        class="ctx-item"
        :class="{ danger: it.danger, isDisabled: it.disabled }"
        :disabled="it.disabled"
        role="menuitem"
        @click="onLeafClick(it)"
      >
        {{ it.label }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.ctx-panel {
  min-width: 180px;
  max-width: 280px;
}

.ctx-separator {
  height: 1px;
  margin: 6px 8px;
  background: var(--border-light);
}

.ctx-row-wrap {
  position: relative;
}

.ctx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 14px;
  text-align: left;
  font-size: 13px;
  color: var(--text-primary);
  background: transparent;
  border: none;
  cursor: pointer;
}

.ctx-parent {
  font-weight: 500;
}

.ctx-item:hover:not(:disabled) {
  background: var(--bg-hover);
}

.ctx-item.isDisabled,
.ctx-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ctx-item.danger:not(:disabled) {
  color: var(--danger-color);
}

.ctx-chevron {
  flex-shrink: 0;
  opacity: 0.65;
  font-size: 14px;
}

.ctx-flyout {
  position: absolute;
  left: 100%;
  top: -6px;
  margin-left: 4px;
  min-width: 180px;
  max-width: 280px;
  padding: 6px 0;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  z-index: 2;
}

.ctx-flyout .ctx-panel {
  max-width: none;
}
</style>
