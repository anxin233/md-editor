/**
 * WYSIWYG 下已接线的格式命令（与菜单/快捷键对应，用于清单与测试对照）。
 * `table` 在 App 层打开 TableEditor，不经过 MilkdownEditor.handleFormatCommand。
 */
export const WYSIWYG_SUPPORTED_COMMANDS = new Set([
  'bold',
  'italic',
  'underline',
  'code',
  'strikethrough',
  'paragraph',
  'promote-heading',
  'demote-heading',
  'code-block',
  'math-block',
  'horizontal-rule',
  'clear-format',
  'hyperlink',
  'image',
  'blockquote',
  'ordered-list',
  'unordered-list',
  'task-list',
  'insert-above',
  'insert-below',
  'footnote',
  'toc',
  'yaml-front-matter',
  'table-insert',
  'table',
])

export function isWysiwygFormatCommandSupported(command: string): boolean {
  return WYSIWYG_SUPPORTED_COMMANDS.has(command)
}
