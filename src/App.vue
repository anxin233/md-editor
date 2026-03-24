<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import { useSettingsStore } from '@/stores/settings'
import { useFileStore } from '@/stores/file'
import { useEditorStore } from '@/stores/editor'
import { initShiki } from '@/utils/shiki'
import { exportToHtml, exportToPdf, exportToWord } from '@/utils/export'
import { listenAppCommand, type AppCommandDetail } from '@/utils/appCommands'

const settingsStore = useSettingsStore()
const fileStore = useFileStore()
const editorStore = useEditorStore()
const appLayoutRef = ref<InstanceType<typeof AppLayout>>()

let keydownHandler: ((e: KeyboardEvent) => void) | null = null
let autoSaveTimer: ReturnType<typeof setInterval> | null = null
let ctrlTabCleanup: (() => void) | null = null
let appCommandCleanup: (() => void) | null = null

onMounted(async () => {
  await settingsStore.initSettings()
  fileStore.initFileWatcher()
  setupKeyboardShortcuts()
  setupAutoSave()
  setupCtrlTab()
  setupAppCommands()
  initShiki()

  window.addEventListener('beforeunload', onBeforeUnload)
})

onUnmounted(() => {
  fileStore.cleanupWatchers()
  clearAutoSaveTimer()
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler)
  }
  if (ctrlTabCleanup) {
    ctrlTabCleanup()
    ctrlTabCleanup = null
  }
  if (appCommandCleanup) {
    appCommandCleanup()
    appCommandCleanup = null
  }
  window.removeEventListener('beforeunload', onBeforeUnload)
})

function clearAutoSaveTimer() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer)
    autoSaveTimer = null
  }
}

function setupAutoSave() {
  watch(
    [() => settingsStore.autoSave, () => settingsStore.autoSaveInterval],
    ([enabled, interval]) => {
      clearAutoSaveTimer()
      if (enabled) {
        autoSaveTimer = setInterval(() => autoSaveDirtyTabs(), interval * 1000)
      }
    },
    { immediate: true }
  )
}

async function autoSaveDirtyTabs() {
  const dirtyTabs = fileStore.getDirtyTabs()
  for (const tab of dirtyTabs) {
    if (!tab.filePath) continue
    const contentSnapshot = tab.content
    try {
      await window.electronAPI?.file.write(tab.filePath, contentSnapshot)
      if (tab.content === contentSnapshot) {
        fileStore.markSaved(tab.id)
      }
    } catch {
      // silent fail for auto-save
    }
  }
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (fileStore.hasAnyDirty) {
    e.preventDefault()
    e.returnValue = ''
  }
}

function setupKeyboardShortcuts() {
  keydownHandler = async (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey

    if (ctrl && e.key === 'n') {
      e.preventDefault()
      fileStore.createNewTab()
    }

    if (ctrl && e.key === 'o') {
      e.preventDefault()
      await openFileFromDialog()
    }

    if (ctrl && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault()
      await openSearchPanel('find')
    }

    if (ctrl && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault()
      await openSearchPanel('replace')
    }

    if (ctrl && e.key === 's') {
      e.preventDefault()
      await saveCurrentFile(e.shiftKey)
    }

    if (ctrl && e.key === 'w') {
      e.preventDefault()
      if (fileStore.activeTabId) {
        await confirmCloseTab(fileStore.activeTabId)
      }
    }

    if (ctrl && e.key === 'e') {
      e.preventDefault()
      const modes: Array<'wysiwyg' | 'split' | 'source'> = ['wysiwyg', 'split', 'source']
      const idx = modes.indexOf(settingsStore.editorMode)
      settingsStore.setEditorMode(modes[(idx + 1) % modes.length])
    }

    if (ctrl && e.key === 't') {
      e.preventDefault()
      appLayoutRef.value?.openTableEditor()
    }

    if (ctrl && e.key === '\\') {
      e.preventDefault()
      settingsStore.toggleToc()
    }

    if (ctrl && e.shiftKey && e.key === 'F') {
      e.preventDefault()
      settingsStore.toggleFocusMode()
    }

    if (ctrl && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
      e.preventDefault()
      settingsStore.toggleSidebar()
    }

    if (ctrl && e.key === '=') {
      e.preventDefault()
      settingsStore.setFontSize(settingsStore.fontSize + 1)
    }

    if (ctrl && e.key === '-') {
      e.preventDefault()
      settingsStore.setFontSize(settingsStore.fontSize - 1)
    }

    if (ctrl && e.key === '0') {
      e.preventDefault()
      settingsStore.setFontSize(16)
    }

    if (ctrl && e.shiftKey && e.key === 'P') {
      e.preventDefault()
      settingsStore.cycleTheme()
    }

    if (ctrl && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '6') {
      e.preventDefault()
      editorStore.requestHeading(parseInt(e.key))
    }

  }
  window.addEventListener('keydown', keydownHandler)
}

function setupCtrlTab() {
  ctrlTabCleanup = window.electronAPI?.onCtrlTab((isShift: boolean) => {
    const tabs = fileStore.tabs
    if (tabs.length <= 1) return
    const idx = tabs.findIndex(t => t.id === fileStore.activeTabId)
    const nextIdx = isShift
      ? (idx - 1 + tabs.length) % tabs.length
      : (idx + 1) % tabs.length
    fileStore.setActiveTab(tabs[nextIdx].id)
  }) || null
}

function setupAppCommands() {
  appCommandCleanup = listenAppCommand(async (command) => {
    await handleAppCommand(command)
  })
}

async function openFileFromDialog() {
  try {
    const filePath = await window.electronAPI?.dialog.openFile()
    if (!filePath) return
    const opened = await fileStore.openPath(filePath)
    if (!opened) return
    settingsStore.addRecentFile(filePath, opened.fileName)
  } catch (err) {
    console.error('Failed to open file:', err)
  }
}

async function openFolderFromDialog() {
  const folderPath = await window.electronAPI?.dialog.openFolder()
  if (folderPath) {
    fileStore.workspacePath = folderPath
  }
}

async function openRecentFile(filePath: string) {
  try {
    const opened = await fileStore.openPath(filePath)
    if (!opened) {
      settingsStore.removeRecentFile(filePath)
      return
    }
    settingsStore.addRecentFile(filePath, opened.fileName)
  } catch {
    settingsStore.removeRecentFile(filePath)
  }
}

async function saveCurrentFile(saveAs: boolean = false) {
  const tab = fileStore.activeTab
  if (!tab) return

  try {
    const success = await fileStore.saveTab(tab.id, saveAs)
    if (!success) return
    if (fileStore.activeTab?.filePath) {
      settingsStore.addRecentFile(fileStore.activeTab.filePath, fileStore.activeTab.fileName)
    }
  } catch (err) {
    console.error('Failed to save file:', err)
  }
}

async function openSearchPanel(mode: 'find' | 'replace') {
  if (settingsStore.editorMode === 'wysiwyg') {
    settingsStore.setEditorMode('source')
    await nextTick()
  }
  editorStore.requestSearch(mode)
}

async function exportCurrentFile(format: 'pdf' | 'html' | 'word') {
  const tab = fileStore.activeTab
  if (!tab) return

  const fileName = tab.fileName || 'document.md'
  if (format === 'pdf') {
    await exportToPdf(tab.content, fileName, tab.filePath, settingsStore.theme)
  } else if (format === 'html') {
    await exportToHtml(tab.content, fileName, tab.filePath, settingsStore.theme)
  } else {
    await exportToWord(tab.content, fileName, tab.filePath, settingsStore.theme)
  }
}

async function handleAppCommand(command: AppCommandDetail) {
  switch (command.type) {
    case 'file:new':
      fileStore.createNewTab()
      return
    case 'file:open':
      await openFileFromDialog()
      return
    case 'file:open-folder':
      await openFolderFromDialog()
      return
    case 'file:save':
      await saveCurrentFile(false)
      return
    case 'file:save-as':
      await saveCurrentFile(true)
      return
    case 'file:open-recent':
      await openRecentFile(command.path)
      return
    case 'file:export':
      await exportCurrentFile(command.format)
      return
    case 'edit:find':
      await openSearchPanel('find')
      return
    case 'edit:replace':
      await openSearchPanel('replace')
      return
    case 'view:set-mode':
      settingsStore.setEditorMode(command.mode)
      return
    case 'view:toggle-sidebar':
      settingsStore.toggleSidebar()
      return
    case 'view:toggle-toc':
      settingsStore.toggleToc()
      return
    case 'view:toggle-focus':
      settingsStore.toggleFocusMode()
      return
    case 'view:toggle-typewriter':
      settingsStore.toggleTypewriterMode()
      return
    case 'view:font-inc':
      settingsStore.setFontSize(settingsStore.fontSize + 1)
      return
    case 'view:font-dec':
      settingsStore.setFontSize(settingsStore.fontSize - 1)
      return
    case 'view:font-reset':
      settingsStore.setFontSize(16)
      return
    case 'theme:set':
      settingsStore.setTheme(command.theme)
      return
    case 'theme:pick-custom':
      await settingsStore.pickAndLoadCustomCss()
      return
    case 'theme:clear-custom':
      settingsStore.clearCustomCss()
      return
  }
}

async function confirmCloseTab(tabId: string) {
  if (fileStore.isTabDirty(tabId)) {
    const confirmed = window.confirm('文件有未保存的修改，确定要关闭吗？')
    if (!confirmed) return
  }
  fileStore.closeTab(tabId)
}

defineExpose({ saveCurrentFile, confirmCloseTab, openFileFromDialog, openFolderFromDialog })
</script>

<template>
  <AppLayout ref="appLayoutRef" />
</template>
