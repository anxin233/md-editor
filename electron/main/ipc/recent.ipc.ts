import { app, ipcMain } from 'electron'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { basename, dirname, extname, join, resolve } from 'path'
import { assertReadText, grantMarkdownFileAndDocDirectory } from '../security/fileAccess'

export interface RecentFileItem {
  path: string
  name: string
  time: number
}

const MARKDOWN_EXT = new Set(['.md', '.markdown', '.mdown', '.mkd'])

function isMarkdownPath(filePath: string): boolean {
  return MARKDOWN_EXT.has(extname(filePath).toLowerCase())
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
    const abs = resolve(filePath)
    if (!isMarkdownPath(abs)) return readRecentFiles()
    try {
      assertReadText(abs)
    } catch {
      return readRecentFiles()
    }
    const current = await readRecentFiles()
    const next = current.filter(item => resolve(item.path) !== abs)
    next.unshift({ path: abs, name: fileName, time: Date.now() })
    await writeRecentFiles(next)
    return next.slice(0, 20)
  })

  ipcMain.handle('recent:open', async (_event, filePath: string): Promise<{
    filePath: string
    fileName: string
    content: string
  } | null> => {
    const resolvedRequested = resolve(filePath)
    if (!isMarkdownPath(resolvedRequested)) return null
    const recent = await readRecentFiles()
    const allowed = recent.some(r => resolve(r.path) === resolvedRequested)
    if (!allowed) return null
    try {
      await stat(resolvedRequested)
    } catch {
      return null
    }
    grantMarkdownFileAndDocDirectory(resolvedRequested)
    const content = await readFile(resolvedRequested, 'utf-8')
    const fileName = basename(resolvedRequested)
    return { filePath: resolvedRequested, fileName, content }
  })

  ipcMain.handle('recent:remove', async (_event, filePath: string): Promise<RecentFileItem[]> => {
    const current = await readRecentFiles()
    const next = current.filter(item => resolve(item.path) !== resolve(filePath))
    await writeRecentFiles(next)
    return next
  })

  ipcMain.handle('recent:clear', async (): Promise<boolean> => {
    await writeRecentFiles([])
    return true
  })
}
