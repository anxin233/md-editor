<script setup lang="ts">
import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useContextMenuStore } from '@/stores/contextMenu'
import { useFileStore } from '@/stores/file'
import ContextMenuPanel from './ContextMenuPanel.vue'

const store = useContextMenuStore()
const fileStore = useFileStore()
const { visible, x, y, items } = storeToRefs(store)

watch(() => fileStore.activeTabId, () => {
  if (visible.value) store.hide()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="context-menu-root"
      :style="{ left: x + 'px', top: y + 'px' }"
      role="menu"
      @mousedown.prevent.stop
    >
      <ContextMenuPanel :entries="items" />
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu-root {
  position: fixed;
  z-index: 10000;
  padding: 6px 0;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  overflow: visible;
}
</style>
