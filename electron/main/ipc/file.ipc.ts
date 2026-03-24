import { ipcMain, BrowserWindow } from 'electron'
import { readFile, writeFile, stat, readdir, mkdir, rename, unlink, rm, access } from 'fs/promises'
import { watch, FSWatcher } from 'fs'
import { dirname, isAbsolute, join, relative, resolve } from 'path'

export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileTreeNode[]
}

const fileWatchers = new Map<string, FSWatcher>()
const allowedPaths = new Set<string>()

export function addAllowedPath(dirPath: string) {
  allowedPaths.add(resolve(dirPath))
}

function isPathAllowed(targetPath: string): boolean {
  if (allowedPaths.size === 0) return false
  const normalizedTarget = resolve(targetPath)
  for (const allowed of allowedPaths) {
    const rel = relative(allowed, normalizedTarget)
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      return true
    }
  }
  return false
}

function validatePath(targetPath: string): string {
  const resolved = resolve(targetPath)
  if (!isPathAllowed(resolved)) {
    throw new Error(`Access denied: ${resolved}`)
  }
  return resolved
}

export function registerFileIpcHandlers() {
  ipcMain.handle('file:grantAccess', (_event, targetPath: string): boolean => {
    const safeTarget = resolve(targetPath)
    addAllowedPath(safeTarget)
    addAllowedPath(dirname(safeTarget))
    return true
  })

  ipcMain.handle('file:read', async (_event, filePath: string): Promise<string> => {
    const safePath = validatePath(filePath)
    const content = await readFile(safePath, 'utf-8')
    return content
  })

  ipcMain.handle('file:readBinary', async (_event, filePath: string): Promise<Uint8Array> => {
    const safePath = validatePath(filePath)
    const content = await readFile(safePath)
    return new Uint8Array(content)
  })

  ipcMain.handle('file:write', async (_event, filePath: string, content: string): Promise<boolean> => {
    const safePath = validatePath(filePath)
    await writeFile(safePath, content, 'utf-8')
    return true
  })

  ipcMain.handle('file:readDir', async (_event, dirPath: string): Promise<FileTreeNode[]> => {
    const safePath = validatePath(dirPath)
    return await readDirectoryTree(safePath)
  })

  ipcMain.handle('file:stat', async (_event, filePath: string) => {
    const safePath = validatePath(filePath)
    const stats = await stat(safePath)
    return {
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      size: stats.size,
      mtime: stats.mtimeMs
    }
  })

  ipcMain.handle('file:exists', async (_event, filePath: string): Promise<boolean> => {
    try {
      const safePath = validatePath(filePath)
      await access(safePath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('file:createFile', async (_event, filePath: string, content: string = ''): Promise<boolean> => {
    const safePath = validatePath(filePath)
    await writeFile(safePath, content, 'utf-8')
    return true
  })

  ipcMain.handle('file:createDir', async (_event, dirPath: string): Promise<boolean> => {
    const safePath = validatePath(dirPath)
    await mkdir(safePath, { recursive: true })
    return true
  })

  ipcMain.handle('file:rename', async (_event, oldPath: string, newPath: string): Promise<boolean> => {
    const safeOld = validatePath(oldPath)
    const safeNew = validatePath(newPath)
    await rename(safeOld, safeNew)
    return true
  })

  ipcMain.handle('file:delete', async (_event, filePath: string): Promise<boolean> => {
    const safePath = validatePath(filePath)
    const stats = await stat(safePath)
    if (stats.isDirectory()) {
      await rm(safePath, { recursive: true, force: true })
    } else {
      await unlink(safePath)
    }
    return true
  })

  ipcMain.handle('file:saveImage', async (_event, dirPath: string, fileName: string, buffer: Uint8Array): Promise<string> => {
    const safeDirPath = validatePath(dirPath)
    const sanitizedFileName = fileName.replace(/[/\\]/g, '').replace(/\.\./g, '')
    if (!sanitizedFileName) throw new Error('Invalid file name')
    const imagesDir = join(safeDirPath, 'images')
    await mkdir(imagesDir, { recursive: true })
    const filePath = join(imagesDir, sanitizedFileName)
    validatePath(filePath)
    await writeFile(filePath, Buffer.from(buffer))
    return filePath
  })

  ipcMain.handle('file:watch', (_event, filePath: string) => {
    const safePath = validatePath(filePath)
    if (fileWatchers.has(safePath)) return

    try {
      const watcher = watch(safePath, (eventType) => {
        const windows = BrowserWindow.getAllWindows()
        for (const win of windows) {
          win.webContents.send('file:changed', { path: filePath, eventType })
        }
      })
      fileWatchers.set(safePath, watcher)
    } catch {
      // ignore watch errors on invalid paths
    }
  })

  ipcMain.handle('file:unwatch', (_event, filePath: string) => {
    const safePath = validatePath(filePath)
    const watcher = fileWatchers.get(safePath)
    if (watcher) {
      watcher.close()
      fileWatchers.delete(safePath)
    }
  })
}

export function closeAllWatchers() {
  for (const watcher of fileWatchers.values()) {
    watcher.close()
  }
  fileWatchers.clear()
}

async function readDirectoryTree(dirPath: string): Promise<FileTreeNode[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const nodes: FileTreeNode[] = []

  const sortedEntries = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  for (const entry of sortedEntries) {
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'node_modules') continue

    const fullPath = join(dirPath, entry.name)
    const node: FileTreeNode = {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory()
    }

    nodes.push(node)
  }

  return nodes
}
