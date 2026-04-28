import { ipcMain, BrowserWindow } from 'electron'
import { readFile, writeFile, stat, readdir, mkdir, rename, unlink, rm } from 'fs/promises'
import { watch, FSWatcher } from 'fs'
import { join, resolve } from 'path'
import {
  assertCreateInParent,
  assertDelete,
  assertReadDir,
  assertReadText,
  assertRenamePath,
  assertSaveImageBaseDir,
  assertStatAllowed,
  assertWatch,
  assertWriteText,
  assertImageBufferMatchesExt,
  existsWithPermission,
  readDocumentImageForExport,
} from '../security/fileAccess'

export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
}

const fileWatchers = new Map<string, FSWatcher>()
const MAX_PASTE_IMAGE_BYTES = 10 * 1024 * 1024

export function registerFileIpcHandlers() {
  ipcMain.handle('file:read', async (_event, filePath: string): Promise<string> => {
    const safePath = assertReadText(filePath)
    return await readFile(safePath, 'utf-8')
  })

  ipcMain.handle('file:readDocumentImage', async (_event, sourceMarkdownPath: string | null, imageSrc: string) => {
    return readDocumentImageForExport(sourceMarkdownPath, imageSrc)
  })

  ipcMain.handle('file:write', async (_event, filePath: string, content: string): Promise<boolean> => {
    const safePath = assertWriteText(filePath)
    await writeFile(safePath, content, 'utf-8')
    return true
  })

  ipcMain.handle('file:readDir', async (_event, dirPath: string): Promise<FileTreeNode[]> => {
    const safePath = assertReadDir(dirPath)
    return await readDirectoryTree(safePath)
  })

  ipcMain.handle('file:stat', async (_event, filePath: string) => {
    const safePath = await assertStatAllowed(filePath)
    const stats = await stat(safePath)
    return {
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      size: stats.size,
      mtime: stats.mtimeMs
    }
  })

  ipcMain.handle('file:exists', async (_event, filePath: string): Promise<boolean> => {
    return existsWithPermission(filePath)
  })

  ipcMain.handle('file:createFile', async (_event, filePath: string, content: string = ''): Promise<boolean> => {
    const safe = resolve(filePath)
    assertCreateInParent(safe)
    assertWriteText(safe)
    await writeFile(safe, content, 'utf-8')
    return true
  })

  ipcMain.handle('file:createDir', async (_event, dirPath: string): Promise<boolean> => {
    const resolved = resolve(dirPath)
    assertCreateInParent(resolved)
    await mkdir(resolved, { recursive: true })
    return true
  })

  ipcMain.handle('file:rename', async (_event, oldPath: string, newPath: string): Promise<boolean> => {
    const safeOld = assertRenamePath(oldPath)
    const safeNew = assertRenamePath(newPath)
    await rename(safeOld, safeNew)
    return true
  })

  ipcMain.handle('file:delete', async (_event, filePath: string): Promise<boolean> => {
    const safePath = assertDelete(filePath)
    const stats = await stat(safePath)
    if (stats.isDirectory()) {
      await rm(safePath, { recursive: true, force: true })
    } else {
      await unlink(safePath)
    }
    return true
  })

  ipcMain.handle('file:saveImage', async (_event, dirPath: string, fileName: string, buffer: Uint8Array): Promise<string> => {
    if (buffer.length > MAX_PASTE_IMAGE_BYTES) {
      throw new Error('Image too large')
    }
    const safeDirPath = assertSaveImageBaseDir(dirPath)
    const sanitizedFileName = fileName.replace(/[/\\]/g, '').replace(/\.\./g, '')
    if (!sanitizedFileName) throw new Error('Invalid file name')
    const lower = sanitizedFileName.toLowerCase()
    if (!/\.(png|jpe?g|gif|webp)$/i.test(lower)) {
      throw new Error('Invalid image extension')
    }
    assertImageBufferMatchesExt(buffer, sanitizedFileName)
    const imagesDir = join(safeDirPath, 'images')
    await mkdir(imagesDir, { recursive: true })
    const filePath = join(imagesDir, sanitizedFileName)
    assertWriteText(filePath)
    await writeFile(filePath, Buffer.from(buffer))
    return filePath
  })

  ipcMain.handle('file:watch', (_event, filePath: string) => {
    const safePath = assertWatch(filePath)
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
    const safePath = assertWatch(filePath)
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
