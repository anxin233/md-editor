import { app, BrowserWindow, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

let targetWindow: BrowserWindow | null = null
let registered = false

export function attachUpdateTargetWindow(win: BrowserWindow | null) {
  targetWindow = win
}

function sendStatus(payload: unknown) {
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.webContents.send('update:status', payload)
  }
}

/** 仅注册一次；所有 autoUpdater 事件与 IPC 均在此绑定 */
export function registerUpdateIpcHandlers() {
  if (registered) return
  registered = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendStatus({ state: 'checking' })
  })

  autoUpdater.on('update-available', info => {
    sendStatus({ state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    sendStatus({ state: 'latest' })
  })

  autoUpdater.on('download-progress', progress => {
    sendStatus({
      state: 'downloading',
      percent: progress.percent,
    })
  })

  autoUpdater.on('update-downloaded', info => {
    sendStatus({ state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', error => {
    sendStatus({
      state: 'error',
      message: error.message || String(error),
    })
  })

  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      return {
        state: 'disabled',
        message: '开发环境不检查自动更新',
      }
    }
    await autoUpdater.checkForUpdates()
    return { state: 'checking' }
  })

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
  })
}
