import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { extname, join, resolve } from 'path'
import { clearCssFileGrant, replaceCssFileGrant } from '../security/fileAccess'

const MAX_CUSTOM_CSS_BYTES = 1024 * 1024

function cssPathRecordFile(): string {
  return join(app.getPath('userData'), 'custom-css-path.json')
}

async function persistCustomCssRecord(cssPath: string | null): Promise<void> {
  const dir = app.getPath('userData')
  await mkdir(dir, { recursive: true })
  await writeFile(cssPathRecordFile(), JSON.stringify({ path: cssPath }, null, 2), 'utf-8')
}

export function registerSettingsIpcHandlers() {
  /** 只能选择 CSS；对话框 → 校验 → replaceCssGrant → 读入 → 持久化（renderer 无法再传任意路径） */
  ipcMain.handle(
    'settings:pickCustomCss',
    async (): Promise<{ path: string; content: string } | null> => {
      const window = BrowserWindow.getFocusedWindow()
      if (!window) return null
      const result = await dialog.showOpenDialog(window, {
        properties: ['openFile'],
        filters: [{ name: 'CSS', extensions: ['css'] }],
      })
      if (result.canceled || result.filePaths.length === 0) return null
      const picked = resolve(result.filePaths[0])
      if (extname(picked).toLowerCase() !== '.css') return null
      let st: Awaited<ReturnType<typeof stat>>
      try {
        st = await stat(picked)
      } catch {
        return null
      }
      if (!st.isFile() || st.size > MAX_CUSTOM_CSS_BYTES) return null
      replaceCssFileGrant(picked)
      let content: string
      try {
        content = await readFile(picked, 'utf-8')
      } catch {
        clearCssFileGrant()
        await persistCustomCssRecord(null)
        return null
      }
      await persistCustomCssRecord(picked)
      return { path: picked, content }
    },
  )

  ipcMain.handle('settings:loadPersistedCustomCss', async (): Promise<{ path: string; content: string } | null> => {
    try {
      const raw = await readFile(cssPathRecordFile(), 'utf-8')
      const parsed = JSON.parse(raw) as { path?: string | null }
      const p = parsed.path
      if (!p || typeof p !== 'string') return null
      const abs = resolve(p)
      if (extname(abs).toLowerCase() !== '.css') return null
      if (!existsSync(abs)) return null
      let st: Awaited<ReturnType<typeof stat>>
      try {
        st = await stat(abs)
      } catch {
        return null
      }
      if (!st.isFile() || st.size > MAX_CUSTOM_CSS_BYTES) return null
      replaceCssFileGrant(abs)
      const content = await readFile(abs, 'utf-8')
      return { path: abs, content }
    } catch {
      return null
    }
  })

  ipcMain.handle('settings:clearCustomCssPath', async () => {
    try {
      clearCssFileGrant()
      const dir = app.getPath('userData')
      await mkdir(dir, { recursive: true })
      await writeFile(cssPathRecordFile(), JSON.stringify({ path: null }, null, 2), 'utf-8')
    } catch {
      // ignore
    }
    return true
  })
}
