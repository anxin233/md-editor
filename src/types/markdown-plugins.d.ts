declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it'
  interface TexmathOptions {
    engine: any
    delimiters: string
    katexOptions?: Record<string, any>
  }
  const plugin: (md: MarkdownIt, options?: TexmathOptions) => void
  export default plugin
}

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-emoji' {
  import type MarkdownIt from 'markdown-it'
  export const full: MarkdownIt.PluginSimple
  export const light: MarkdownIt.PluginSimple
  export const bare: MarkdownIt.PluginSimple
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it'
  interface TaskListsOptions {
    enabled?: boolean
    label?: boolean
    labelAfter?: boolean
  }
  const plugin: (md: MarkdownIt, options?: TaskListsOptions) => void
  export default plugin
}

declare module 'markdown-it-front-matter' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt, callback: (fm: string) => void) => void
  export default plugin
}
