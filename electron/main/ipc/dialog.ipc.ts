import { ipcMain, dialog, BrowserWindow } from 'electron'
import { dirname } from 'path'
import { addAllowedPath } from './file.ipc'

export function registerDialogIpcHandlers() {
  ipcMain.handle('dialog:openFile', async () => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    addAllowedPath(dirname(filePath))
    return filePath
  })

  ipcMain.handle('dialog:openFolder', async () => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) return null
    const folderPath = result.filePaths[0]
    addAllowedPath(folderPath)
    return folderPath
  })

  ipcMain.handle('dialog:saveFile', async (_event, defaultPath?: string) => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null

    const result = await dialog.showSaveDialog(window, {
      defaultPath,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) return null
    addAllowedPath(dirname(result.filePath))
    return result.filePath
  })

  ipcMain.handle('dialog:openCssFile', async () => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [
        { name: 'CSS', extensions: ['css'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    addAllowedPath(dirname(filePath))
    return filePath
  })
}
