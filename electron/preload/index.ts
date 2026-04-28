import { contextBridge, ipcRenderer } from 'electron'

export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
}

export interface FileStat {
  isDirectory: boolean
  isFile: boolean
  size: number
  mtime: number
}

export interface FileChangeEvent {
  path: string
  eventType: string
}

export interface ElectronAPI {
  getAppVersion: () => Promise<string>
  openExternal: (url: string) => Promise<void>
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    confirmClose: (hasDirty: boolean) => Promise<number>
  }
  file: {
    read: (filePath: string) => Promise<string>
    /** 导出：仅允许文档目录下的安全相对路径图片 */
    readDocumentImage: (
      sourceMarkdownPath: string | null,
      imageSrc: string
    ) => Promise<{ bytes: Uint8Array; mime: string } | null>
    write: (filePath: string, content: string) => Promise<boolean>
    readDir: (dirPath: string) => Promise<FileTreeNode[]>
    stat: (filePath: string) => Promise<FileStat>
    exists: (filePath: string) => Promise<boolean>
    createFile: (filePath: string, content?: string) => Promise<boolean>
    createDir: (dirPath: string) => Promise<boolean>
    rename: (oldPath: string, newPath: string) => Promise<boolean>
    delete: (filePath: string) => Promise<boolean>
    saveImage: (dirPath: string, fileName: string, buffer: Uint8Array) => Promise<string>
    watch: (filePath: string) => Promise<void>
    unwatch: (filePath: string) => Promise<void>
    onChanged: (callback: (event: FileChangeEvent) => void) => () => void
  }
  dialog: {
    openFile: () => Promise<string | null>
    openFolder: () => Promise<string | null>
    saveFile: (defaultPath?: string) => Promise<string | null>
  }
  recent: {
    get: () => Promise<Array<{ path: string; name: string; time: number }>>
    add: (filePath: string, fileName: string) => Promise<Array<{ path: string; name: string; time: number }>>
    open: (filePath: string) => Promise<{ filePath: string; fileName: string; content: string } | null>
    remove: (filePath: string) => Promise<Array<{ path: string; name: string; time: number }>>
    clear: () => Promise<boolean>
  }
  settings: {
    pickCustomCss: () => Promise<{ path: string; content: string } | null>
    loadPersistedCustomCss: () => Promise<{ path: string; content: string } | null>
    clearCustomCssPath: () => Promise<boolean>
  }
  export: {
    pdf: (htmlContent: string, defaultName?: string) => Promise<boolean>
    html: (htmlContent: string, defaultName?: string) => Promise<boolean>
    word: (docxBuffer: Uint8Array, defaultName?: string) => Promise<boolean>
  }
  onCtrlTab: (callback: (isShift: boolean) => void) => () => void
}

const electronAPI: ElectronAPI = {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    confirmClose: (hasDirty: boolean) => ipcRenderer.invoke('window:confirmClose', hasDirty),
  },
  file: {
    read: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
    readDocumentImage: (sourceMarkdownPath: string | null, imageSrc: string) =>
      ipcRenderer.invoke('file:readDocumentImage', sourceMarkdownPath, imageSrc),
    write: (filePath: string, content: string) => ipcRenderer.invoke('file:write', filePath, content),
    readDir: (dirPath: string) => ipcRenderer.invoke('file:readDir', dirPath),
    stat: (filePath: string) => ipcRenderer.invoke('file:stat', filePath),
    exists: (filePath: string) => ipcRenderer.invoke('file:exists', filePath),
    createFile: (filePath: string, content?: string) => ipcRenderer.invoke('file:createFile', filePath, content),
    createDir: (dirPath: string) => ipcRenderer.invoke('file:createDir', dirPath),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('file:rename', oldPath, newPath),
    delete: (filePath: string) => ipcRenderer.invoke('file:delete', filePath),
    saveImage: (dirPath: string, fileName: string, buffer: Uint8Array) => ipcRenderer.invoke('file:saveImage', dirPath, fileName, buffer),
    watch: (filePath: string) => ipcRenderer.invoke('file:watch', filePath),
    unwatch: (filePath: string) => ipcRenderer.invoke('file:unwatch', filePath),
    onChanged: (callback: (event: FileChangeEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: FileChangeEvent) => callback(data)
      ipcRenderer.on('file:changed', handler)
      return () => ipcRenderer.removeListener('file:changed', handler)
    },
  },
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
    saveFile: (defaultPath?: string) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  },
  recent: {
    get: () => ipcRenderer.invoke('recent:get'),
    add: (filePath: string, fileName: string) => ipcRenderer.invoke('recent:add', filePath, fileName),
    open: (filePath: string) => ipcRenderer.invoke('recent:open', filePath),
    remove: (filePath: string) => ipcRenderer.invoke('recent:remove', filePath),
    clear: () => ipcRenderer.invoke('recent:clear'),
  },
  settings: {
    pickCustomCss: () => ipcRenderer.invoke('settings:pickCustomCss'),
    loadPersistedCustomCss: () => ipcRenderer.invoke('settings:loadPersistedCustomCss'),
    clearCustomCssPath: () => ipcRenderer.invoke('settings:clearCustomCssPath'),
  },
  export: {
    pdf: (htmlContent: string, defaultName?: string) => ipcRenderer.invoke('export:pdf', htmlContent, defaultName),
    html: (htmlContent: string, defaultName?: string) => ipcRenderer.invoke('export:html', htmlContent, defaultName),
    word: (docxBuffer: Uint8Array, defaultName?: string) => ipcRenderer.invoke('export:word', docxBuffer, defaultName),
  },
  onCtrlTab: (callback: (isShift: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isShift: boolean) => callback(isShift)
    ipcRenderer.on('shortcut:ctrl-tab', handler)
    return () => ipcRenderer.removeListener('shortcut:ctrl-tab', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
