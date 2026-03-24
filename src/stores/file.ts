import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface FileTab {
  id: string
  filePath: string | null
  fileName: string
  content: string
  savedContent: string
  isNew: boolean
}

export const useFileStore = defineStore('file', () => {
  const tabs = ref<FileTab[]>([])
  const activeTabId = ref<string | null>(null)
  const workspacePath = ref<string | null>(null)

  let fileChangeCleanup: (() => void) | null = null

  const activeTab = computed(() => {
    return tabs.value.find(t => t.id === activeTabId.value) || null
  })

  const isDirty = computed(() => {
    if (!activeTab.value) return false
    return activeTab.value.content !== activeTab.value.savedContent
  })

  const hasAnyDirty = computed(() => {
    return tabs.value.some(t => t.content !== t.savedContent)
  })

  function normalizeFilePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/\/+$/, '')
  }

  function isPathEqualOrNested(targetPath: string | null, basePath: string): boolean {
    if (!targetPath) return false
    const target = normalizeFilePath(targetPath)
    const base = normalizeFilePath(basePath)
    return target === base || target.startsWith(base + '/')
  }

  function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
  }

  function createNewTab(): FileTab {
    const existingNames = new Set(tabs.value.filter(t => t.isNew).map(t => t.fileName))
    let idx = 1
    let name = '未命名.md'
    while (existingNames.has(name)) {
      idx++
      name = `未命名 ${idx}.md`
    }

    const tab: FileTab = {
      id: generateId(),
      filePath: null,
      fileName: name,
      content: '',
      savedContent: '',
      isNew: true,
    }
    tabs.value.push(tab)
    activeTabId.value = tab.id
    return tab
  }

  function openFileTab(filePath: string, fileName: string, content: string) {
    const existing = tabs.value.find(t => t.filePath === filePath)
    if (existing) {
      activeTabId.value = existing.id
      if (existing.content === existing.savedContent) {
        existing.content = content
        existing.savedContent = content
      }
      return existing
    }

    const tab: FileTab = {
      id: generateId(),
      filePath,
      fileName,
      content,
      savedContent: content,
      isNew: false,
    }
    tabs.value.push(tab)
    activeTabId.value = tab.id

    watchFile(filePath)

    return tab
  }

  function closeTab(tabId: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return

    const filePathToUnwatch = tab.filePath

    const idx = tabs.value.findIndex(t => t.id === tabId)
    tabs.value.splice(idx, 1)

    if (filePathToUnwatch) {
      unwatchFile(filePathToUnwatch)
    }

    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        const newIdx = Math.min(idx, tabs.value.length - 1)
        activeTabId.value = tabs.value[newIdx].id
      } else {
        activeTabId.value = null
      }
    }
  }

  function setActiveTab(tabId: string) {
    activeTabId.value = tabId
  }

  function updateContent(content: string) {
    if (activeTab.value) {
      activeTab.value.content = content
    }
  }

  function markSaved(tabId: string, filePath?: string, fileName?: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return

    tab.savedContent = tab.content
    tab.isNew = false

    if (filePath && tab.filePath !== filePath) {
      if (tab.filePath) unwatchFile(tab.filePath)
      tab.filePath = filePath
      watchFile(filePath)
    }
    if (fileName) tab.fileName = fileName
  }

  function isTabDirty(tabId: string): boolean {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return false
    return tab.content !== tab.savedContent
  }

  function getDirtyTabs(): FileTab[] {
    return tabs.value.filter(t => t.content !== t.savedContent)
  }

  function getTabByPath(filePath: string): FileTab | undefined {
    return tabs.value.find(t => t.filePath === filePath)
  }

  function updateTabByPath(filePath: string, newContent: string) {
    const tab = tabs.value.find(t => t.filePath === filePath)
    if (tab && tab.content === tab.savedContent) {
      tab.content = newContent
      tab.savedContent = newContent
    }
  }

  async function authorizePath(filePath: string) {
    await window.electronAPI?.file.authorize(filePath)
  }

  async function openPath(filePath: string) {
    await authorizePath(filePath)
    const content = await window.electronAPI?.file.read(filePath)
    if (content == null) return null
    const fileName = filePath.split(/[\\/]/).pop() || 'unknown.md'
    openFileTab(filePath, fileName, content)
    return { fileName, content }
  }

  async function saveTab(tabId: string, saveAs: boolean = false) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return false

    let filePath = tab.filePath
    if (!filePath || saveAs) {
      filePath = await window.electronAPI?.dialog.saveFile(filePath || undefined) || null
      if (!filePath) return false
    }

    await authorizePath(filePath)
    await window.electronAPI?.file.write(filePath, tab.content)
    const fileName = filePath.split(/[\\/]/).pop() || 'unknown.md'
    markSaved(tab.id, filePath, fileName)
    return true
  }

  async function saveDirtyTabs() {
    const dirtyTabs = getDirtyTabs()
    for (const tab of dirtyTabs) {
      const success = await saveTab(tab.id)
      if (!success) return false
    }
    return true
  }

  function renameTabsInPath(oldPath: string, newPath: string) {
    const newName = newPath.split(/[\\/]/).pop() || newPath
    for (const tab of tabs.value) {
      if (!tab.filePath || !isPathEqualOrNested(tab.filePath, oldPath)) continue
      const suffix = normalizeFilePath(tab.filePath).slice(normalizeFilePath(oldPath).length)
      const nextPath = normalizeFilePath(newPath) + suffix
      if (tab.filePath) unwatchFile(tab.filePath)
      tab.filePath = nextPath.replace(/\//g, oldPath.includes('\\') ? '\\' : '/')
      watchFile(tab.filePath)
      if (isPathEqualOrNested(tab.filePath, newPath) && tab.fileName === oldPath.split(/[\\/]/).pop()) {
        tab.fileName = newName
      } else if (tab.filePath) {
        tab.fileName = tab.filePath.split(/[\\/]/).pop() || tab.fileName
      }
    }
  }

  function closeTabsInPath(targetPath: string) {
    const idsToClose = tabs.value
      .filter(tab => isPathEqualOrNested(tab.filePath, targetPath))
      .map(tab => tab.id)

    for (const id of idsToClose) {
      closeTab(id)
    }
  }

  function watchFile(filePath: string) {
    window.electronAPI?.file.watch(filePath)
  }

  function unwatchFile(filePath: string) {
    const stillUsed = tabs.value.some(t => t.filePath === filePath)
    if (!stillUsed) {
      window.electronAPI?.file.unwatch(filePath)
    }
  }

  function initFileWatcher() {
    if (fileChangeCleanup) fileChangeCleanup()
    fileChangeCleanup = window.electronAPI?.file.onChanged(async (event) => {
      const tab = tabs.value.find(t => t.filePath === event.path)
      if (!tab) return

      if (tab.content !== tab.savedContent) return

      try {
        const newContent = await window.electronAPI?.file.read(event.path)
        tab.content = newContent
        tab.savedContent = newContent
      } catch {
        // file might have been deleted
      }
    }) || null
  }

  function cleanupWatchers() {
    if (fileChangeCleanup) {
      fileChangeCleanup()
      fileChangeCleanup = null
    }
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    workspacePath,
    isDirty,
    hasAnyDirty,
    createNewTab,
    openFileTab,
    closeTab,
    setActiveTab,
    updateContent,
    markSaved,
    isTabDirty,
    getDirtyTabs,
    getTabByPath,
    updateTabByPath,
    authorizePath,
    openPath,
    saveTab,
    saveDirtyTabs,
    renameTabsInPath,
    closeTabsInPath,
    initFileWatcher,
    cleanupWatchers,
  }
})
