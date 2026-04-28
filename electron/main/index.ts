import { existsSync } from 'node:fs'
import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { registerFileIpcHandlers, closeAllWatchers } from './ipc/file.ipc'
import { registerDialogIpcHandlers } from './ipc/dialog.ipc'
import { registerExportIpcHandlers } from './ipc/export.ipc'
import { registerRecentIpcHandlers } from './ipc/recent.ipc'
import { registerSettingsIpcHandlers } from './ipc/settings.ipc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null

/** Same asset as electron-builder `build.icon` (Vite copies `public/` → `dist/`). */
function resolveWindowIcon(): string | undefined {
  const distIcon = join(__dirname, '../../dist/icon.png')
  const publicIcon = join(__dirname, '../../public/icon.png')
  if (app.isPackaged) {
    return existsSync(distIcon) ? distIcon : undefined
  }
  if (existsSync(publicIcon)) return publicIcon
  if (existsSync(distIcon)) return distIcon
  return undefined
}

Menu.setApplicationMenu(null)

const createWindow = () => {
  const windowIcon = resolveWindowIcon()
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    backgroundColor: '#1e1e1e',
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    }
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.log(`[Renderer ${level === 2 ? 'WARN' : 'ERROR'}] ${message} (${sourceId}:${line})`)
    }
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details.reason)
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  }

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.control && input.key === 'Tab') {
      _event.preventDefault()
      mainWindow?.webContents.send('shortcut:ctrl-tab', input.shift)
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  registerFileIpcHandlers()
  registerDialogIpcHandlers()
  registerExportIpcHandlers()
  registerRecentIpcHandlers()
  registerSettingsIpcHandlers()
  registerWindowIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  closeAllWatchers()
})

function registerWindowIpcHandlers() {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false
  })

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url)
    }
  })

  ipcMain.handle('window:confirmClose', async (_event, hasDirty: boolean) => {
    if (!hasDirty || !mainWindow) return true

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '未保存的更改',
      message: '有未保存的文件修改，确定要关闭窗口吗？',
      buttons: ['保存并关闭', '不保存关闭', '取消'],
      defaultId: 0,
      cancelId: 2,
    })

    return result.response
  })

}
