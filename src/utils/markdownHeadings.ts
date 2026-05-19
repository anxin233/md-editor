export interface MarkdownHeading {
  headingIndex: number
  level: number
  text: string
  line: number
}

/** Parse ATX headings from Markdown (skips fenced code blocks and YAML front matter). */
export function parseMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = []
  const lines = markdown.split('\n')
  let inCodeBlock = false
  let inFrontMatter = false
  let headingIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trimStart()

    if (i === 0 && trimmedLine === '---') {
      inFrontMatter = true
      continue
    }
    if (inFrontMatter) {
      if (trimmedLine === '---' || trimmedLine === '...') {
        inFrontMatter = false
      }
      continue
    }

    if (trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (!match) continue

    headings.push({
      headingIndex: headingIndex++,
      level: match[1].length,
      text: match[2].replace(/[#*`\[\]()]/g, '').trim(),
      line: i + 1,
    })
  }

  return headings
}
