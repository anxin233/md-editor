import mermaid from 'mermaid'
import { renderMarkdown } from './markdown'

function getExportStyles(): string {
  return `
    body {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 24px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
      font-size: 16px;
      line-height: 1.8;
      color: #1a1a1a;
      background: #fff;
    }
    .preview-content h1 { font-size: 2em; font-weight: 700; margin: 1em 0 0.5em; padding-bottom: 0.3em; border-bottom: 1px solid #e0e0e0; }
    .preview-content h2 { font-size: 1.5em; font-weight: 600; margin: 0.8em 0 0.4em; padding-bottom: 0.25em; border-bottom: 1px solid #eee; }
    .preview-content h3 { font-size: 1.25em; font-weight: 600; margin: 0.8em 0 0.4em; }
    .preview-content h4 { font-size: 1.1em; font-weight: 600; margin: 0.6em 0 0.3em; }
    .preview-content h5 { font-size: 1em; font-weight: 600; margin: 0.5em 0 0.3em; }
    .preview-content h6 { font-size: 0.9em; font-weight: 600; margin: 0.5em 0 0.3em; color: #666; }
    .preview-content p { margin: 0.6em 0; }
    .preview-content strong { font-weight: 600; }
    .preview-content em { font-style: italic; }
    .preview-content del { text-decoration: line-through; color: #999; }
    .preview-content a { color: #4a90d9; text-decoration: none; }
    .preview-content a:hover { text-decoration: underline; }
    .preview-content blockquote { margin: 0.8em 0; padding: 0.5em 1em; border-left: 4px solid #4a90d9; background: #f7f7f7; color: #666; border-radius: 0 4px 4px 0; }
    .preview-content blockquote p { margin: 0.3em 0; }
    .preview-content ul, .preview-content ol { margin: 0.6em 0; padding-left: 2em; }
    .preview-content li { margin: 0.25em 0; }
    .preview-content code { font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size: 0.9em; padding: 2px 6px; background: #f0f0f0; border-radius: 4px; color: #4a90d9; }
    .preview-content pre, .preview-content .code-block { position: relative; margin: 1em 0; padding: 16px 20px; background: #f7f7f7; border: 1px solid #e0e0e0; border-radius: 6px; overflow-x: auto; }
    .preview-content pre code, .preview-content .code-block code { padding: 0; background: none; color: #1a1a1a; font-size: 0.85em; line-height: 1.6; }
    .preview-content .code-block-wrapper { position: relative; margin: 1em 0; border-radius: 6px; overflow: hidden; }
    .preview-content .code-block-wrapper pre { margin: 0; }
    .preview-content .code-lang { position: absolute; top: 6px; right: 10px; font-size: 11px; color: #999; pointer-events: none; }
    .preview-content table { width: 100%; margin: 1em 0; border-collapse: collapse; }
    .preview-content th, .preview-content td { padding: 8px 12px; border: 1px solid #e0e0e0; text-align: left; }
    .preview-content th { background: #f7f7f7; font-weight: 600; }
    .preview-content tr:nth-child(2n) { background: #f7f7f7; }
    .preview-content img { max-width: 100%; border-radius: 6px; margin: 0.5em 0; }
    .preview-content hr { margin: 1.5em 0; border: none; border-top: 1px solid #e0e0e0; }
    .preview-content input[type="checkbox"] { margin-right: 6px; vertical-align: middle; }
    .preview-content .front-matter-block { margin: 0 0 1.5em; border: 1px solid #e0e0e0; border-radius: 6px; }
    .preview-content .front-matter-block summary { padding: 8px 12px; font-size: 13px; color: #666; cursor: pointer; }
    .preview-content .front-matter-block pre { margin: 0; border: none; border-top: 1px solid #e0e0e0; border-radius: 0 0 6px 6px; }
    .preview-content .mermaid-rendered { text-align: center; margin: 1em 0; }
    .preview-content .mermaid-error { color: #e53e3e; font-size: 13px; }
    .preview-content .footnotes { margin-top: 2em; padding-top: 1em; border-top: 1px solid #e0e0e0; font-size: 0.9em; color: #666; }
  `
}

function guessMimeType(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return encodeURI(normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`)
}

function resolveLocalAssetPath(src: string, sourceFilePath?: string | null): string | null {
  if (!src || /^(data:|blob:|https?:)/i.test(src)) return null

  if (/^file:/i.test(src)) {
    const url = new URL(src)
    const pathname = decodeURIComponent(url.pathname)
    return /^\/[a-zA-Z]:\//.test(pathname) ? pathname.slice(1) : pathname
  }

  if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith('/')) {
    return src
  }

  if (!sourceFilePath) return null

  const baseUrl = new URL(toFileUrl(sourceFilePath))
  const resolvedUrl = new URL(src, baseUrl)
  const pathname = decodeURIComponent(resolvedUrl.pathname)
  return /^\/[a-zA-Z]:\//.test(pathname) ? pathname.slice(1) : pathname
}

async function inlineLocalImages(renderedBody: string, sourceFilePath?: string | null): Promise<string> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${renderedBody}</div>`, 'text/html')
  const images = Array.from(doc.querySelectorAll('img'))

  for (const img of images) {
    const src = img.getAttribute('src') || ''
    const absolutePath = resolveLocalAssetPath(src, sourceFilePath)
    if (!absolutePath) continue

    try {
      await window.electronAPI?.file.authorize(absolutePath)
      const bytes = await window.electronAPI?.file.readBinary(absolutePath)
      if (!bytes) continue

      let binary = ''
      for (const byte of bytes) {
        binary += String.fromCharCode(byte)
      }
      const base64 = btoa(binary)
      img.setAttribute('src', `data:${guessMimeType(absolutePath)};base64,${base64}`)
    } catch {
      // Keep the original src when the file is no longer accessible.
    }
  }

  return doc.body.firstElementChild?.innerHTML || renderedBody
}

let exportMermaidCounter = 0

async function renderMermaidForExport(renderedBody: string, theme: 'light' | 'dark' | 'sepia' | 'nord'): Promise<string> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${renderedBody}</div>`, 'text/html')
  const blocks = Array.from(doc.querySelectorAll('.mermaid-pending'))
  if (blocks.length === 0) return renderedBody

  mermaid.initialize({
    startOnLoad: false,
    theme: theme === 'dark' || theme === 'nord' ? 'dark' : 'default',
    securityLevel: 'strict',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
  })

  for (const block of blocks) {
    const codeEl = block.querySelector('code')
    const content = codeEl?.textContent || block.textContent || ''
    if (!content.trim()) continue

    try {
      const { svg } = await mermaid.render(`export-mermaid-${++exportMermaidCounter}`, content.trim())
      const wrapper = document.createElement('div')
      wrapper.innerHTML = svg
      const svgEl = wrapper.querySelector('svg')
      if (svgEl) {
        svgEl.removeAttribute('onload')
        svgEl.removeAttribute('onerror')
        block.replaceWith(svgEl)
      }
    } catch {
      const errorPre = doc.createElement('pre')
      errorPre.className = 'mermaid-error'
      errorPre.textContent = content
      block.replaceWith(errorPre)
    }
  }

  return doc.body.firstElementChild?.innerHTML || renderedBody
}

async function buildHtmlDocument(
  markdownContent: string,
  title: string,
  sourceFilePath?: string | null,
  theme: 'light' | 'dark' | 'sepia' | 'nord' = 'light'
): Promise<string> {
  let renderedBody = renderMarkdown(markdownContent)
  renderedBody = await renderMermaidForExport(renderedBody, theme)
  renderedBody = await inlineLocalImages(renderedBody, sourceFilePath)
  const styles = getExportStyles()
  const baseHref = sourceFilePath ? `<base href="${toFileUrl(sourceFilePath.replace(/[\\/][^\\/]+$/, '/'))}">` : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${baseHref}
  <style>${styles}</style>
</head>
<body>
  <div class="preview-content">
    ${renderedBody}
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function exportToPdf(
  markdownContent: string,
  fileName: string,
  sourceFilePath?: string | null,
  theme: 'light' | 'dark' | 'sepia' | 'nord' = 'light'
): Promise<boolean> {
  try {
    const html = await buildHtmlDocument(markdownContent, fileName.replace(/\.\w+$/, ''), sourceFilePath, theme)
    return await window.electronAPI?.export.pdf(html, fileName) ?? false
  } catch (err) {
    console.error('PDF export failed:', err)
    return false
  }
}

export async function exportToHtml(
  markdownContent: string,
  fileName: string,
  sourceFilePath?: string | null,
  theme: 'light' | 'dark' | 'sepia' | 'nord' = 'light'
): Promise<boolean> {
  try {
    const html = await buildHtmlDocument(markdownContent, fileName.replace(/\.\w+$/, ''), sourceFilePath, theme)
    return await window.electronAPI?.export.html(html, fileName) ?? false
  } catch (err) {
    console.error('HTML export failed:', err)
    return false
  }
}

export async function exportToWord(
  markdownContent: string,
  fileName: string,
  sourceFilePath?: string | null,
  theme: 'light' | 'dark' | 'sepia' | 'nord' = 'light'
): Promise<boolean> {
  try {
    const { default: htmlToDocx } = await import('html-to-docx')
    const html = await buildHtmlDocument(markdownContent, fileName.replace(/\.\w+$/, ''), sourceFilePath, theme)
    const docxBlob = await htmlToDocx(html, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    })

    let buffer: Uint8Array
    if (docxBlob instanceof Blob) {
      buffer = new Uint8Array(await docxBlob.arrayBuffer())
    } else if (docxBlob instanceof ArrayBuffer) {
      buffer = new Uint8Array(docxBlob)
    } else if (Buffer.isBuffer(docxBlob)) {
      buffer = new Uint8Array(docxBlob)
    } else {
      buffer = new Uint8Array(docxBlob as ArrayBuffer)
    }

    return await window.electronAPI?.export.word(buffer, fileName) ?? false
  } catch (err) {
    console.error('Word export failed:', err)
    return false
  }
}
