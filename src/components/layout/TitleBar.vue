<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useFileStore } from '@/stores/file'
import { dispatchAppCommand } from '@/utils/appCommands'

const settingsStore = useSettingsStore()
const fileStore = useFileStore()
const isMaximized = ref(false)
const isClosing = ref(false)
const openMenu = ref<string | null>(null)
const appVersion = ref('1.0.0')
const showShortcutDialog = ref(false)
const showAboutDialog = ref(false)
const showUpdateDialog = ref(false)

const recentFiles = computed(() => settingsStore.recentFiles.slice(0, 8))

const shortcutGroups = [
  ['Ctrl+N', '新建文件'],
  ['Ctrl+O', '打开文件'],
  ['Ctrl+S / Ctrl+Shift+S', '保存 / 另存为'],
  ['Ctrl+F / Ctrl+H', '搜索 / 替换'],
  ['Ctrl+E', '切换编辑模式'],
  ['Ctrl+Shift+B', '切换侧边栏'],
  ['Ctrl+\\', '切换大纲'],
  ['Ctrl+Shift+F', '专注模式'],
  ['Ctrl+T', '插入表格'],
  ['Ctrl+Tab', '切换标签页'],
]

function toggleMenu(menuName: string) {
  openMenu.value = openMenu.value === menuName ? null : menuName
}

function closeMenu() {
  openMenu.value = null
}

function onGlobalPointerDown(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.menu-root')) {
    closeMenu()
  }
}

function onGlobalKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeMenu()
    showShortcutDialog.value = false
    showAboutDialog.value = false
    showUpdateDialog.value = false
  }
}

async function checkMaximized() {
  if (window.electronAPI) {
    isMaximized.value = await window.electronAPI.window.isMaximized()
  }
}

async function loadAppVersion() {
  appVersion.value = await window.electronAPI?.getAppVersion?.() || appVersion.value
}

function minimize() {
  window.electronAPI?.window.minimize()
}

async function toggleMaximize() {
  await window.electronAPI?.window.maximize()
  await checkMaximized()
}

async function close() {
  if (isClosing.value) return
  if (fileStore.hasAnyDirty) {
    isClosing.value = true
    try {
      const action = await window.electronAPI?.window.confirmClose(true)
      if (action === 2 || action == null) return
      if (action === 0) {
        const saved = await fileStore.saveDirtyTabs()
        if (!saved) return
      }
    } finally {
      isClosing.value = false
    }
  }
  window.electronAPI?.window.close()
}

function runCommand(detail: Parameters<typeof dispatchAppCommand>[0]) {
  closeMenu()
  dispatchAppCommand(detail)
}

function openShortcuts() {
  closeMenu()
  showShortcutDialog.value = true
}

function openAbout() {
  closeMenu()
  showAboutDialog.value = true
}

function checkUpdates() {
  closeMenu()
  showUpdateDialog.value = true
}

onMounted(() => {
  checkMaximized()
  loadAppVersion()
  window.addEventListener('resize', checkMaximized)
  window.addEventListener('mousedown', onGlobalPointerDown)
  window.addEventListener('keydown', onGlobalKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMaximized)
  window.removeEventListener('mousedown', onGlobalPointerDown)
  window.removeEventListener('keydown', onGlobalKeyDown)
})
</script>

<template>
  <div class="titlebar">
    <div class="titlebar-drag">
      <div class="titlebar-left">
        <!-- 与 package.json build.icon（public/icon.png）同一资源，避免小尺寸 SVG 走样 -->
        <img class="app-icon" src="/icon.png" width="28" height="28" alt="" draggable="false" />
        <div class="menu-items">
          <div class="menu-root">
            <button class="menu-trigger" :class="{ active: openMenu === 'file' }" @click.stop="toggleMenu('file')">文件(F)</button>
            <div v-if="openMenu === 'file'" class="dropdown-menu">
              <button class="dropdown-item" @click="runCommand({ type: 'file:new' })">
                <span>新建</span><span class="shortcut">Ctrl+N</span>
              </button>
              <button class="dropdown-item" @click="runCommand({ type: 'file:open' })">
                <span>打开文件</span><span class="shortcut">Ctrl+O</span>
              </button>
              <button class="dropdown-item" @click="runCommand({ type: 'file:open-folder' })">
                <span>打开文件夹</span>
              </button>
              <div class="menu-divider"></div>
              <button class="dropdown-item" :disabled="!fileStore.activeTab" @click="runCommand({ type: 'file:save' })">
                <span>保存</span><span class="shortcut">Ctrl+S</span>
              </button>
              <button class="dropdown-item" :disabled="!fileStore.activeTab" @click="runCommand({ type: 'file:save-as' })">
                <span>另存为</span><span class="shortcut">Ctrl+Shift+S</span>
              </button>
              <div class="menu-divider"></div>
              <button class="dropdown-item" :disabled="!fileStore.activeTab" @click="runCommand({ type: 'file:export', format: 'pdf' })">
                <span>导出 PDF</span>
              </button>
              <button class="dropdown-item" :disabled="!fileStore.activeTab" @click="runCommand({ type: 'file:export', format: 'html' })">
                <span>导出 HTML</span>
              </button>
              <button class="dropdown-item" :disabled="!fileStore.activeTab" @click="runCommand({ type: 'file:export', format: 'word' })">
                <span>导出 Word</span>
              </button>
              <template v-if="recentFiles.length">
                <div class="menu-divider"></div>
                <div class="dropdown-section-title">最近文件</div>
                <button
                  v-for="file in recentFiles"
                  :key="file.path"
                  class="dropdown-item recent-item"
                  @click="runCommand({ type: 'file:open-recent', path: file.path })"
                >
                  <span class="recent-name">{{ file.name }}</span>
                  <span class="recent-path">{{ file.path }}</span>
                </button>
              </template>
              <div class="menu-divider"></div>
              <button class="dropdown-item danger" @click="close">
                <span>退出</span><span class="shortcut">Alt+F4</span>
              </button>
            </div>
          </div>

          <div class="menu-root">
            <button class="menu-trigger" :class="{ active: openMenu === 'edit' }" @click.stop="toggleMenu('edit')">编辑(E)</button>
            <div v-if="openMenu === 'edit'" class="dropdown-menu">
              <button class="dropdown-item" :disabled="!fileStore.activeTab" @click="runCommand({ type: 'edit:find' })">
                <span>查找</span><span class="shortcut">Ctrl+F</span>
              </button>
              <button class="dropdown-item" :disabled="!fileStore.activeTab" @click="runCommand({ type: 'edit:replace' })">
                <span>替换</span><span class="shortcut">Ctrl+H</span>
              </button>
            </div>
          </div>

          <div class="menu-root">
            <button class="menu-trigger" :class="{ active: openMenu === 'view' }" @click.stop="toggleMenu('view')">视图(V)</button>
            <div v-if="openMenu === 'view'" class="dropdown-menu">
              <button class="dropdown-item" @click="runCommand({ type: 'view:set-mode', mode: 'wysiwyg' })">
                <span>所见即所得</span><span class="check-mark" v-if="settingsStore.editorMode === 'wysiwyg'">✓</span>
              </button>
              <button class="dropdown-item" @click="runCommand({ type: 'view:set-mode', mode: 'split' })">
                <span>分栏预览</span><span class="check-mark" v-if="settingsStore.editorMode === 'split'">✓</span>
              </button>
              <button class="dropdown-item" @click="runCommand({ type: 'view:set-mode', mode: 'source' })">
                <span>源码模式</span><span class="check-mark" v-if="settingsStore.editorMode === 'source'">✓</span>
              </button>
              <div class="menu-divider"></div>
              <button class="dropdown-item" @click="runCommand({ type: 'view:toggle-sidebar' })">
                <span>侧边栏</span><span class="check-mark" v-if="settingsStore.showSidebar">✓</span>
              </button>
              <button class="dropdown-item" @click="runCommand({ type: 'view:toggle-toc' })">
                <span>大纲面板</span><span class="check-mark" v-if="settingsStore.showToc">✓</span>
              </button>
              <button class="dropdown-item" @click="runCommand({ type: 'view:toggle-focus' })">
                <span>专注模式</span><span class="check-mark" v-if="settingsStore.focusMode">✓</span>
              </button>
              <button class="dropdown-item" @click="runCommand({ type: 'view:toggle-typewriter' })">
                <span>打字机模式</span><span class="check-mark" v-if="settingsStore.typewriterMode">✓</span>
              </button>
              <div class="menu-divider"></div>
              <button class="dropdown-item" @click="runCommand({ type: 'view:font-inc' })">
                <span>放大字号</span><span class="shortcut">Ctrl+=</span>
              </button>
              <button class="dropdown-item" @click="runCommand({ type: 'view:font-dec' })">
                <span>缩小字号</span><span class="shortcut">Ctrl+-</span>
              </button>
              <button class="dropdown-item" @click="runCommand({ type: 'view:font-reset' })">
                <span>重置字号</span><span class="shortcut">Ctrl+0</span>
              </button>
            </div>
          </div>

          <div class="menu-root">
            <button class="menu-trigger" :class="{ active: openMenu === 'theme' }" @click.stop="toggleMenu('theme')">主题(T)</button>
            <div v-if="openMenu === 'theme'" class="dropdown-menu">
              <button class="dropdown-item" @click="runCommand({ type: 'theme:set', theme: 'light' })">
                <span>亮色</span><span class="check-mark" v-if="settingsStore.theme === 'light'">✓</span>
              </button>
              <button class="dropdown-item" @click="runCommand({ type: 'theme:set', theme: 'dark' })">
                <span>暗色</span><span class="check-mark" v-if="settingsStore.theme === 'dark'">✓</span>
              </button>
              <button class="dropdown-item" @click="runCommand({ type: 'theme:set', theme: 'sepia' })">
                <span>护眼</span><span class="check-mark" v-if="settingsStore.theme === 'sepia'">✓</span>
              </button>
              <button class="dropdown-item" @click="runCommand({ type: 'theme:set', theme: 'nord' })">
                <span>Nord</span><span class="check-mark" v-if="settingsStore.theme === 'nord'">✓</span>
              </button>
              <div class="menu-divider"></div>
              <button class="dropdown-item" @click="runCommand({ type: 'theme:pick-custom' })">
                <span>加载自定义 CSS</span>
              </button>
              <button class="dropdown-item" :disabled="!settingsStore.customCssPath" @click="runCommand({ type: 'theme:clear-custom' })">
                <span>清除自定义 CSS</span>
              </button>
            </div>
          </div>

          <div class="menu-root">
            <button class="menu-trigger" :class="{ active: openMenu === 'help' }" @click.stop="toggleMenu('help')">帮助(H)</button>
            <div v-if="openMenu === 'help'" class="dropdown-menu">
              <button class="dropdown-item" @click="openShortcuts">
                <span>快捷键说明</span>
              </button>
              <button class="dropdown-item" @click="checkUpdates">
                <span>检查更新</span>
              </button>
              <button class="dropdown-item" @click="openAbout">
                <span>关于 MD Editor</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="titlebar-center">
        <span class="title-text">
          {{ fileStore.activeTab?.fileName || 'MD Editor' }}
          <span v-if="fileStore.isDirty" class="dirty-dot"></span>
        </span>
      </div>

      <div class="titlebar-right">
        <button
          class="theme-toggle"
          title="切换主题"
          @click="settingsStore.cycleTheme"
        >
          <svg v-if="settingsStore.theme === 'dark'" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z"/>
          </svg>
          <svg v-else-if="settingsStore.theme === 'light'" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1A.5.5 0 0 1 8 1zm0 11a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1A.5.5 0 0 1 8 12zm7-4a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1 0-1h1a.5.5 0 0 1 .5.5zM4 8a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1 0-1h1A.5.5 0 0 1 4 8zm9.45-3.87a.5.5 0 0 1-.7.7l-.71-.7a.5.5 0 0 1 .7-.71l.71.71zM4.96 12.61a.5.5 0 0 1-.7.7l-.71-.7a.5.5 0 0 1 .7-.71l.71.71zm8.49 0a.5.5 0 0 1-.7 0l-.71-.71a.5.5 0 0 1 .7-.7l.71.7a.5.5 0 0 1 0 .71zM4.96 3.39a.5.5 0 0 1-.7 0l-.71-.71a.5.5 0 1 1 .7-.7l.71.7a.5.5 0 0 1 0 .71zM8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
            <path d="M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13z"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="window-controls">
      <button class="win-btn" @click="minimize" title="最小化">
        <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
      </button>
      <button class="win-btn" @click="toggleMaximize" :title="isMaximized ? '还原' : '最大化'">
        <svg v-if="!isMaximized" width="10" height="10" viewBox="0 0 10 10">
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
        <svg v-else width="10" height="10" viewBox="0 0 10 10">
          <rect x="2.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/>
          <rect x="0.5" y="2.5" width="7" height="7" fill="var(--titlebar-bg)" stroke="currentColor" stroke-width="1"/>
        </svg>
      </button>
      <button class="win-btn win-close" @click="close" title="关闭">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.2"/>
          <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </button>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showShortcutDialog || showAboutDialog || showUpdateDialog" class="menu-overlay" @click.self="showShortcutDialog = showAboutDialog = showUpdateDialog = false">
      <div v-if="showShortcutDialog" class="menu-dialog">
        <div class="dialog-header">
          <span>快捷键说明</span>
          <button class="dialog-close" @click="showShortcutDialog = false">×</button>
        </div>
        <div class="dialog-content">
          <div v-for="[keys, label] in shortcutGroups" :key="keys" class="shortcut-row">
            <span class="shortcut-keys">{{ keys }}</span>
            <span class="shortcut-label">{{ label }}</span>
          </div>
        </div>
      </div>

      <div v-else-if="showAboutDialog" class="menu-dialog">
        <div class="dialog-header">
          <span>关于 MD Editor</span>
          <button class="dialog-close" @click="showAboutDialog = false">×</button>
        </div>
        <div class="dialog-content">
          <p class="dialog-title">MD Editor</p>
          <p>版本：{{ appVersion }}</p>
          <p>一个基于 Electron + Vue 3 的 Markdown 编辑器。</p>
          <p>支持所见即所得、分栏预览、Mermaid、公式、导出与主题切换。</p>
        </div>
      </div>

      <div v-else class="menu-dialog">
        <div class="dialog-header">
          <span>检查更新</span>
          <button class="dialog-close" @click="showUpdateDialog = false">×</button>
        </div>
        <div class="dialog-content">
          <p class="dialog-title">当前版本：{{ appVersion }}</p>
          <p>当前已接入菜单中的“检查更新”入口。</p>
          <p>尚未配置在线更新源，如需自动更新，还需要补充发布服务器或版本源。</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.titlebar {
  height: var(--titlebar-height);
  background: var(--titlebar-bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  position: relative;
  z-index: 100;
}

.titlebar-drag {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
}

.titlebar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  -webkit-app-region: no-drag;
}

.app-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  margin-right: 8px;
  display: block;
  object-fit: contain;
  border-radius: 5px;
  user-select: none;
  pointer-events: none;
}

.menu-items {
  display: flex;
  align-items: center;
  gap: 2px;
}

.menu-root {
  position: relative;
}

.menu-trigger {
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.menu-trigger:hover,
.menu-trigger.active {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 240px;
  padding: 6px 0;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}

.dropdown-item {
  width: 100%;
  min-height: 30px;
  padding: 6px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
  text-align: left;
  color: var(--text-primary);
}

.dropdown-item:hover:not(:disabled) {
  background: var(--bg-hover);
}

.dropdown-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dropdown-item.danger {
  color: var(--danger-color);
}

.menu-divider {
  height: 1px;
  margin: 6px 10px;
  background: var(--border-light);
}

.dropdown-section-title {
  padding: 4px 14px 2px;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
}

.shortcut,
.check-mark {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.recent-item {
  align-items: flex-start;
  flex-direction: column;
  gap: 2px;
}

.recent-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-path {
  max-width: 100%;
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.titlebar-center {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.title-text {
  font-size: var(--font-size-small);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.dirty-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-color);
}

.titlebar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 8px;
  -webkit-app-region: no-drag;
}

.theme-toggle {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.theme-toggle:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.window-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: background var(--transition-fast);
}

.win-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.win-close:hover {
  background: var(--danger-color);
  color: white;
}

.menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
}

.menu-dialog {
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: hidden;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}

.dialog-header {
  height: 44px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
  font-weight: 600;
}

.dialog-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
  color: var(--text-secondary);
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.dialog-close {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
}

.dialog-close:hover {
  background: var(--bg-hover);
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.shortcut-keys {
  min-width: 160px;
  font-family: var(--font-family-mono);
  color: var(--text-primary);
}

.shortcut-label {
  color: var(--text-secondary);
}
</style>
