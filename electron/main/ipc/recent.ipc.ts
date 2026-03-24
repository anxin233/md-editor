import { app, ipcMain } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

interface RecentFileItem {
  path: string
  name: string
  time: number
}

const recentFilePath = join(app.getPath('userData'), 'recent-files.json')

async function ensureRecentFile() {
  await mkdir(dirname(recentFilePath), { recursive: true })
  try {
    await readFile(recentFilePath, 'utf-8')
  } catch {
    await writeFile(recentFilePath, '[]', 'utf-8')
  }
}

async function readRecentFiles(): Promise<RecentFileItem[]> {
  await ensureRecentFile()
  try {
    const content = await readFile(recentFilePath, 'utf-8')
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeRecentFiles(items: RecentFileItem[]) {
  await ensureRecentFile()
  await writeFile(recentFilePath, JSON.stringify(items.slice(0, 20), null, 2), 'utf-8')
}

export function registerRecentIpcHandlers() {
  ipcMain.handle('recent:get', async (): Promise<RecentFileItem[]> => {
    return readRecentFiles()
  })

  ipcMain.handle('recent:add', async (_event, filePath: string, fileName: string): Promise<RecentFileItem[]> => {
    const current = await readRecentFiles()
    const next = current.filter(item => item.path !== filePath)
    next.unshift({ path: filePath, name: fileName, time: Date.now() })
    await writeRecentFiles(next)
    return next.slice(0, 20)
  })

  ipcMain.handle('recent:remove', async (_event, filePath: string): Promise<RecentFileItem[]> => {
    const current = await readRecentFiles()
    const next = current.filter(item => item.path !== filePath)
    await writeRecentFiles(next)
    return next
  })

  ipcMain.handle('recent:clear', async (): Promise<boolean> => {
    await writeRecentFiles([])
    return true
  })
}
