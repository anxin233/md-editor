/**
 * 操作级文件权限：仅主进程可信入口可追加权限条目。
 */
import { readFile, stat } from 'fs/promises'
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'path'

export type FileOperation =
  | 'readText'
  | 'writeText'
  | 'watch'
  | 'readDir'
  | 'create'
  | 'rename'
  | 'delete'
  | 'saveImage'
  | 'readDocumentImage'

export interface FilePermissionEntry {
  root: string
  kind: 'file' | 'directory'
  operations: Set<FileOperation>
  /** 内部用于替换 CSS 单文件授权 */
  tag?: 'css'
}

const entries: FilePermissionEntry[] = []

function pathInDirectoryScope(dirRoot: string, targetAbs: string): boolean {
  const root = resolve(dirRoot)
  const p = resolve(targetAbs)
  const rel = relative(root, p)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function addEntry(e: FilePermissionEntry): void {
  entries.push({
    root: resolve(e.root),
    kind: e.kind,
    operations: new Set(e.operations),
    tag: e.tag,
  })
}

/** 打开/保存通过对话框或 recent 打开的 Markdown：单文件 + 文档目录窄权限 */
export function grantMarkdownFileAndDocDirectory(filePath: string): void {
  const resolved = resolve(filePath)
  const dir = dirname(resolved)
  addEntry({
    kind: 'file',
    root: resolved,
    operations: new Set<FileOperation>(['readText', 'writeText', 'watch']),
  })
  addEntry({
    kind: 'directory',
    root: dir,
    operations: new Set<FileOperation>(['readDocumentImage', 'saveImage']),
  })
}

/** 仅「打开文件夹」工作区 */
export function grantWorkspaceDirectory(folderPath: string): void {
  addEntry({
    kind: 'directory',
    root: resolve(folderPath),
    operations: new Set<FileOperation>([
      'readText',
      'writeText',
      'watch',
      'readDir',
      'create',
      'rename',
      'delete',
      'saveImage',
      'readDocumentImage',
    ]),
  })
}

/** 替换 CSS 单文件只读授权（仅 readText） */
export function replaceCssFileGrant(cssPath: string): void {
  const p = resolve(cssPath)
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].tag === 'css') entries.splice(i, 1)
  }
  addEntry({
    kind: 'file',
    root: p,
    operations: new Set<FileOperation>(['readText']),
    tag: 'css',
  })
}

export function clearCssFileGrant(): void {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].tag === 'css') entries.splice(i, 1)
  }
}

const INLINE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export function hasFileAccessPublic(absPath: string, op: FileOperation): boolean {
  return hasFileAccess(resolve(absPath), op)
}

function hasFileAccess(p: string, op: FileOperation): boolean {
  for (const e of entries) {
    if (e.kind === 'file') {
      if (resolve(e.root) !== p) continue
      return e.operations.has(op)
    }
    if (!pathInDirectoryScope(e.root, p)) continue
    if (!e.operations.has(op)) continue
    if (op === 'readDocumentImage') {
      const ext = extname(p).toLowerCase()
      if (!INLINE_EXT.has(ext)) continue
    }
    return true
  }
  return false
}

/** 路径是否落在任一已授权范围（用于 exists 等统一拒绝，不泄露存在性细节时仍先判范围） */
function hasAnyScopeForPath(p: string): boolean {
  for (const e of entries) {
    if (e.kind === 'file' && resolve(e.root) === p) return true
    if (e.kind === 'directory' && pathInDirectoryScope(e.root, p)) return true
  }
  return false
}

export function assertFileAccess(targetPath: string, op: FileOperation): string {
  const p = resolve(targetPath)
  if (!hasFileAccess(p, op)) {
    throw new Error(`Access denied: ${targetPath}`)
  }
  return p
}

/** 读文本文件 */
export function assertReadText(targetPath: string): string {
  return assertFileAccess(targetPath, 'readText')
}

export function assertWriteText(targetPath: string): string {
  return assertFileAccess(targetPath, 'writeText')
}

export function assertWatch(targetPath: string): string {
  return assertFileAccess(targetPath, 'watch')
}

export function assertReadDir(targetPath: string): string {
  return assertFileAccess(targetPath, 'readDir')
}

export function assertCreateInParent(newFilePath: string): void {
  const parent = dirname(resolve(newFilePath))
  assertFileAccess(parent, 'create')
}

export function assertDelete(targetPath: string): string {
  return assertFileAccess(targetPath, 'delete')
}

export function assertRenamePath(targetPath: string): string {
  return assertFileAccess(targetPath, 'rename')
}

export function assertSaveImageBaseDir(dirPath: string): string {
  return assertFileAccess(dirPath, 'saveImage')
}

/** stat：先要求路径落在已授权范围内，再读取元数据并校验操作类型 */
export async function assertStatAllowed(targetPath: string): Promise<string> {
  const abs = resolve(targetPath)
  if (!hasAnyScopeForPath(abs)) throw new Error(`Access denied: ${targetPath}`)
  let st: Awaited<ReturnType<typeof stat>>
  try {
    st = await stat(abs)
  } catch {
    throw new Error(`Access denied: ${targetPath}`)
  }
  if (st.isDirectory()) {
    if (!hasFileAccess(abs, 'readDir')) throw new Error(`Access denied: ${targetPath}`)
  } else {
    if (
      !hasFileAccess(abs, 'readText')
      && !hasFileAccess(abs, 'writeText')
      && !hasFileAccess(abs, 'watch')
      && !hasFileAccess(abs, 'readDocumentImage')
    ) {
      throw new Error(`Access denied: ${targetPath}`)
    }
  }
  return abs
}

export async function existsWithPermission(targetPath: string): Promise<boolean> {
  const abs = resolve(targetPath)
  if (!hasAnyScopeForPath(abs)) return false
  try {
    await stat(abs)
    return true
  } catch {
    return false
  }
}

function extFromName(name: string): string {
  return extname(name).toLowerCase()
}

function mimeFromExt(ext: string): string {
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

export function sniffImageMime(buf: Uint8Array): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png'
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg'
  }
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return 'image/gif'
  }
  if (
    buf.length >= 12
    && String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) === 'RIFF'
    && String.fromCharCode(buf[8], buf[9], buf[10], buf[11]) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

/** 粘贴/保存图片：扩展名与魔数一致 */
export function assertImageBufferMatchesExt(buffer: Uint8Array, fileName: string): void {
  const ext = extFromName(fileName)
  if (!INLINE_EXT.has(ext)) throw new Error('Invalid image type')
  const sniffed = sniffImageMime(buffer)
  const fromExt = mimeFromExt(ext)
  if (!sniffed || sniffed !== fromExt) throw new Error('Image content does not match extension')
}

/** 导出内联本地图 */
export async function readDocumentImageForExport(
  sourceMarkdownPath: string | null,
  srcAttr: string
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!sourceMarkdownPath || !srcAttr.trim()) return null

  let src = srcAttr.trim()
  const hashIdx = src.search(/[?#]/)
  if (hashIdx >= 0) src = src.slice(0, hashIdx).trim()

  if (!src) return null
  if (/^(data:|blob:|https?:)/i.test(src)) return null
  if (/^file:/i.test(src)) return null
  if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith('/')) return null

  let docDir: string
  try {
    docDir = dirname(resolve(sourceMarkdownPath))
  } catch {
    return null
  }

  let joined: string
  try {
    joined = normalize(join(docDir, decodeURIComponent(src)))
  } catch {
    return null
  }

  const resolved = resolve(joined)
  const rel = relative(docDir, resolved)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null

  const ext = extFromName(resolved)
  if (!INLINE_EXT.has(ext)) return null

  assertFileAccess(resolved, 'readDocumentImage')

  let stats: Awaited<ReturnType<typeof stat>>
  try {
    stats = await stat(resolved)
  } catch {
    return null
  }
  if (!stats.isFile() || stats.size > MAX_IMAGE_BYTES) return null

  const raw = await readFile(resolved)
  const buf = new Uint8Array(raw)
  const sniffed = sniffImageMime(buf)
  const fromExt = mimeFromExt(ext)
  if (!sniffed || sniffed !== fromExt) return null

  return { bytes: buf, mime: sniffed }
}
