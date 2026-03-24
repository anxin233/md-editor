import { createHighlighter, type Highlighter, type BundledLanguage } from 'shiki'

let highlighter: Highlighter | null = null
let initPromise: Promise<void> | null = null
let retryCount = 0
const MAX_RETRIES = 3

const defaultLangs: BundledLanguage[] = [
  'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp',
  'go', 'rust', 'swift', 'kotlin',
  'html', 'css', 'scss', 'json', 'yaml', 'toml', 'xml',
  'markdown', 'bash', 'shell', 'powershell',
  'sql', 'dockerfile', 'diff', 'ini', 'lua',
  'jsx', 'tsx',
]

export async function initShiki(): Promise<void> {
  if (highlighter) return
  if (initPromise) return initPromise

  initPromise = createHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: defaultLangs,
  }).then(h => {
    highlighter = h
    retryCount = 0
  }).catch(err => {
    console.warn('Failed to initialize Shiki:', err)
    initPromise = null
    if (retryCount < MAX_RETRIES) {
      retryCount++
      const delay = 1000 * retryCount
      console.log(`Retrying Shiki init in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`)
      return new Promise<void>(resolve => setTimeout(resolve, delay)).then(() => initShiki())
    }
  })

  return initPromise
}

export function getShikiHighlighter(): Highlighter | null {
  return highlighter
}

export function highlightCode(
  code: string,
  lang: string,
  theme: 'github-dark' | 'github-light'
): string | null {
  if (!highlighter) return null

  try {
    const loadedLangs = highlighter.getLoadedLanguages()
    if (!loadedLangs.includes(lang as BundledLanguage)) return null
    return highlighter.codeToHtml(code, { lang, theme })
  } catch {
    return null
  }
}
