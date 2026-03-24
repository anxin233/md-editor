import { ipcMain, BrowserWindow, dialog } from 'electron'
import { writeFile } from 'fs/promises'

export function registerExportIpcHandlers() {
  ipcMain.handle('export:pdf', async (_event, htmlContent: string, defaultName?: string) => {
    const parentWindow = BrowserWindow.getFocusedWindow()
    if (!parentWindow) return false

    const result = await dialog.showSaveDialog(parentWindow, {
      defaultPath: defaultName?.replace(/\.\w+$/, '.pdf') || 'document.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })

    if (result.canceled || !result.filePath) return false

    const printWindow = new BrowserWindow({
      width: 800,
      height: 900,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      }
    })

    try {
      const encodedHtml = 'data:text/html;base64,' + Buffer.from(htmlContent, 'utf-8').toString('base64')
      await printWindow.loadURL(encodedHtml)

      await new Promise<void>(resolve => setTimeout(resolve, 500))

      const pdfData = await printWindow.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      })

      await writeFile(result.filePath, pdfData)
      return true
    } finally {
      printWindow.destroy()
    }
  })

  ipcMain.handle('export:html', async (_event, htmlContent: string, defaultName?: string) => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return false

    const result = await dialog.showSaveDialog(window, {
      defaultPath: defaultName?.replace(/\.\w+$/, '.html') || 'document.html',
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
    })

    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, htmlContent, 'utf-8')
    return true
  })

  ipcMain.handle('export:word', async (_event, docxBuffer: Uint8Array, defaultName?: string) => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return false

    const result = await dialog.showSaveDialog(window, {
      defaultPath: defaultName?.replace(/\.\w+$/, '.docx') || 'document.docx',
      filters: [{ name: 'Word', extensions: ['docx'] }]
    })

    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, Buffer.from(docxBuffer))
    return true
  })
}
