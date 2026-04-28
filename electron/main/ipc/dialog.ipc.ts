import { ipcMain, dialog, BrowserWindow } from 'electron'
import { grantMarkdownFileAndDocDirectory, grantWorkspaceDirectory } from '../security/fileAccess'

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
    grantMarkdownFileAndDocDirectory(filePath)
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
    grantWorkspaceDirectory(folderPath)
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
    grantMarkdownFileAndDocDirectory(result.filePath)
    return result.filePath
  })
}
