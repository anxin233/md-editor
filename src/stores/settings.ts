import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'sepia' | 'nord'
export type EditorMode = 'wysiwyg' | 'split' | 'source'

export const BUILT_IN_THEMES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: '亮色' },
  { id: 'dark', label: '暗色' },
  { id: 'sepia', label: '护眼' },
  { id: 'nord', label: 'Nord' },
]

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeMode>('dark')
  const editorMode = ref<EditorMode>('wysiwyg')
  const fontSize = ref(16)
  const autoSave = ref(false)
  const autoSaveInterval = ref(30)
  const showSidebar = ref(true)
  const showToc = ref(true)
  const showStatusBar = ref(true)
  const focusMode = ref(false)
  const typewriterMode = ref(false)
  const customCssPath = ref<string | null>(null)
  const recentFiles = ref<{ path: string; name: string; time: number }[]>([])

  let customStyleEl: HTMLStyleElement | null = null

  function setTheme(mode: ThemeMode) {
    theme.value = mode
    document.documentElement.setAttribute('data-theme', mode)
    localStorage.setItem('md-editor-theme', mode)
  }

  function cycleTheme() {
    const themes: ThemeMode[] = ['light', 'dark', 'sepia', 'nord']
    const idx = themes.indexOf(theme.value)
    setTheme(themes[(idx + 1) % themes.length])
  }

  function toggleTheme() {
    cycleTheme()
  }

  function setEditorMode(mode: EditorMode) {
    editorMode.value = mode
    localStorage.setItem('md-editor-mode', mode)
  }

  function toggleSidebar() {
    showSidebar.value = !showSidebar.value
  }

  function toggleToc() {
    showToc.value = !showToc.value
  }

  function toggleFocusMode() {
    focusMode.value = !focusMode.value
  }

  function toggleTypewriterMode() {
    typewriterMode.value = !typewriterMode.value
  }

  function applyCustomCssContent(cssContent: string) {
    if (customStyleEl) {
      customStyleEl.textContent = cssContent
    } else {
      customStyleEl = document.createElement('style')
      customStyleEl.id = 'custom-theme-css'
      customStyleEl.textContent = cssContent
      document.head.appendChild(customStyleEl)
    }
  }

  async function pickAndLoadCustomCss() {
    const result = await window.electronAPI?.settings.pickCustomCss()
    if (!result) return false
    applyCustomCssContent(result.content)
    customCssPath.value = result.path
    localStorage.removeItem('md-editor-custom-css')
    return true
  }

  async function clearCustomCss() {
    if (customStyleEl) {
      customStyleEl.remove()
      customStyleEl = null
    }
    customCssPath.value = null
    localStorage.removeItem('md-editor-custom-css')
    try {
      await window.electronAPI?.settings.clearCustomCssPath()
    } catch {
      // ignore
    }
  }

  function addRecentFile(filePath: string, fileName: string) {
    const filtered = recentFiles.value.filter(f => f.path !== filePath)
    filtered.unshift({ path: filePath, name: fileName, time: Date.now() })
    recentFiles.value = filtered.slice(0, 20)
    window.electronAPI?.recent.add(filePath, fileName).then(items => {
      recentFiles.value = items
    }).catch(() => {
      // Keep the in-memory list even if persistence fails.
    })
  }

  function removeRecentFile(filePath: string) {
    recentFiles.value = recentFiles.value.filter(f => f.path !== filePath)
    window.electronAPI?.recent.remove(filePath).then(items => {
      recentFiles.value = items
    }).catch(() => {
      // ignore persistence failures
    })
  }

  function clearRecentFiles() {
    recentFiles.value = []
    window.electronAPI?.recent.clear().catch(() => {
      // ignore persistence failures
    })
  }

  function setAutoSave(enabled: boolean) {
    autoSave.value = enabled
    localStorage.setItem('md-editor-autosave', enabled ? '1' : '0')
  }

  function setAutoSaveInterval(seconds: number) {
    autoSaveInterval.value = Math.max(5, Math.min(300, seconds))
    localStorage.setItem('md-editor-autosave-interval', String(autoSaveInterval.value))
  }

  function setFontSize(size: number) {
    fontSize.value = Math.max(12, Math.min(28, size))
    document.documentElement.style.setProperty('--font-size-editor', fontSize.value + 'px')
    localStorage.setItem('md-editor-fontsize', String(fontSize.value))
  }

  async function initSettings() {
    const savedTheme = localStorage.getItem('md-editor-theme') as ThemeMode | null
    const savedMode = localStorage.getItem('md-editor-mode') as EditorMode | null

    if (savedTheme && BUILT_IN_THEMES.some(t => t.id === savedTheme)) {
      setTheme(savedTheme)
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setTheme(prefersDark ? 'dark' : 'light')
    }

    if (savedMode) {
      editorMode.value = savedMode
    }

    localStorage.removeItem('md-editor-custom-css')

    const persisted = await window.electronAPI?.settings.loadPersistedCustomCss?.()
    if (persisted) {
      applyCustomCssContent(persisted.content)
      customCssPath.value = persisted.path
    }

    try {
      recentFiles.value = await window.electronAPI?.recent.get() ?? []
    } catch {
      recentFiles.value = []
    }

    const savedAutoSave = localStorage.getItem('md-editor-autosave')
    if (savedAutoSave) autoSave.value = savedAutoSave === '1'

    const savedInterval = localStorage.getItem('md-editor-autosave-interval')
    if (savedInterval) autoSaveInterval.value = parseInt(savedInterval) || 30

    const savedFontSize = localStorage.getItem('md-editor-fontsize')
    if (savedFontSize) {
      fontSize.value = parseInt(savedFontSize) || 16
      document.documentElement.style.setProperty('--font-size-editor', fontSize.value + 'px')
    }
  }

  return {
    theme,
    editorMode,
    fontSize,
    autoSave,
    autoSaveInterval,
    showSidebar,
    showToc,
    showStatusBar,
    focusMode,
    typewriterMode,
    customCssPath,
    recentFiles,
    setTheme,
    cycleTheme,
    toggleTheme,
    setEditorMode,
    toggleSidebar,
    toggleToc,
    toggleFocusMode,
    toggleTypewriterMode,
    pickAndLoadCustomCss,
    clearCustomCss,
    addRecentFile,
    removeRecentFile,
    clearRecentFiles,
    setAutoSave,
    setAutoSaveInterval,
    setFontSize,
    initSettings,
  }
})
