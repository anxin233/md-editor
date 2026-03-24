import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import footnote from 'markdown-it-footnote'
import { full as emoji } from 'markdown-it-emoji'
import taskLists from 'markdown-it-task-lists'
import frontMatter from 'markdown-it-front-matter'
import { highlightCode } from './shiki'

let mdInstance: MarkdownIt | null = null
let lastFrontMatter: string | null = null
let currentTheme: 'github-dark' | 'github-light' = 'github-dark'

export function setHighlightTheme(theme: string) {
  currentTheme = (theme === 'dark' || theme === 'nord') ? 'github-dark' : 'github-light'
}

export function getLastFrontMatter(): string | null {
  return lastFrontMatter
}

export function getMarkdownIt(): MarkdownIt {
  if (mdInstance) return mdInstance

  mdInstance = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(str: string, lang: string): string {
      const escape = mdInstance!.utils.escapeHtml

      if (lang === 'mermaid') {
        return `<pre class="mermaid-pending"><code>${escape(str)}</code></pre>`
      }

      const highlighted = highlightCode(str, lang, currentTheme)
      if (highlighted) {
        const langLabel = lang ? `<span class="code-lang">${escape(lang)}</span>` : ''
        return `<div class="code-block-wrapper">${highlighted}${langLabel}</div>`
      }

      const escapedStr = escape(str)
      const langLabel = lang ? `<span class="code-lang">${escape(lang)}</span>` : ''
      return `<pre class="code-block"><code class="language-${escape(lang)}">${escapedStr}</code>${langLabel}</pre>`
    }
  })

  mdInstance.use(texmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: { throwOnError: false, strict: false }
  })

  mdInstance.use(footnote)
  mdInstance.use(emoji)
  mdInstance.use(taskLists, { enabled: true, label: true, labelAfter: true })

  mdInstance.use(frontMatter, (fm: string) => {
    lastFrontMatter = fm
  })

  return mdInstance
}

export function renderMarkdown(content: string): string {
  lastFrontMatter = null
  const md = getMarkdownIt()
  const html = md.render(content)

  if (lastFrontMatter) {
    const escapedFm = md.utils.escapeHtml(lastFrontMatter)
    const fmHtml = `<details class="front-matter-block"><summary>Front Matter (YAML)</summary><pre><code class="language-yaml">${escapedFm}</code></pre></details>`
    return fmHtml + html
  }

  return html
}
