<script setup lang="ts">
import TitleBar from './TitleBar.vue'
import StatusBar from './StatusBar.vue'
import Sidebar from '@/components/sidebar/Sidebar.vue'
import TabBar from '@/components/tabs/TabBar.vue'
import EditorContainer from '@/components/editor/EditorContainer.vue'
import TocPanel from '@/components/toc/TocPanel.vue'
import { useSettingsStore } from '@/stores/settings'
import { ref } from 'vue'

const settingsStore = useSettingsStore()
const editorContainerRef = ref<InstanceType<typeof EditorContainer>>()

function openTableEditor() {
  editorContainerRef.value?.openTableEditor()
}

defineExpose({ openTableEditor })
</script>

<template>
  <div class="app-layout">
    <TitleBar />

    <div class="main-area">
      <Sidebar />

      <div class="content-area">
        <TabBar />
        <EditorContainer ref="editorContainerRef" />
      </div>

      <TocPanel v-if="settingsStore.showToc" />
    </div>

    <StatusBar @open-table-editor="openTableEditor" />
  </div>
</template>

<style scoped>
.app-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
</style>
