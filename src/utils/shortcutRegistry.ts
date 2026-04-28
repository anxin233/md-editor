import type { AppCommandDetail } from '@/utils/appCommands'

export type ShortcutScope = 'global' | 'editor' | 'view' | 'file'

/** 与 App.vue 中 handleAppCommand 未覆盖的行为配合：循环模式、关标签等 */
export type InternalShortcutId =
  | 'cycle-editor-mode'
  | 'close-current-tab'
  | 'cycle-theme'

/** 仅参与展示与冲突校验，由主进程 / 预加载等派发，不经 renderer keydown */
export type ExternalShortcutId = 'cycle-tabs'

export type ShortcutAction =
  | { kind: 'command'; command: AppCommandDetail }
  | { kind: 'internal'; id: InternalShortcutId }
  | { kind: 'external'; id: ExternalShortcutId }

export interface ShortcutDefinition {
  id: string
  label: string
  /** 用户可见，如 Ctrl+Shift+\ */
  display: string
  /** 与 normalizeKeyboardChord 结果一致（小写） */
  chord: string
  scope: ShortcutScope
  action: ShortcutAction
  /** 默认由渲染进程 keydown 匹配；主进程拦截的快捷键仅用于展示与冲突记录 */
  dispatchMode?: 'renderer-keydown' | 'main-process'
  /** 帮助弹窗：拼在 label 后的补充说明 */
  helpNote?: string
  visibleInHelp?: boolean
  visibleInWelcome?: boolean
}

function lettersFromCode(code: string): string | null {
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Key')) return code.slice(3).toLowerCase()
  return null
}

/**
 * 基于物理键位（code）生成稳定组合键，用于与注册表 chord 比较。
 * 例如：Ctrl+Shift+Backslash → ctrl+shift+\\
 */
export function normalizeKeyboardChord(event: KeyboardEvent): string | null {
  const mod = event.ctrlKey || event.metaKey
  if (!mod) return null

  const parts: string[] = ['ctrl']
  if (event.shiftKey) parts.push('shift')
  if (event.altKey) parts.push('alt')

  const c = event.code
  let key: string | null = lettersFromCode(c)
  if (key == null) {
    switch (c) {
      case 'Equal':
        key = '='
        break
      case 'Minus':
        key = '-'
        break
      case 'BracketLeft':
        key = '['
        break
      case 'BracketRight':
        key = ']'
        break
      case 'Backquote':
        key = '`'
        break
      case 'Backslash':
        key = '\\'
        break
      case 'Space':
        key = 'space'
        break
      case 'Tab':
        key = 'tab'
        break
      default:
        key = event.key.length === 1 ? event.key.toLowerCase() : null
    }
  }
  if (!key) return null
  parts.push(key)
  return parts.join('+')
}

export const SHORTCUTS: ShortcutDefinition[] = [
  { id: 'file-new', label: '新建文件', display: 'Ctrl+N', chord: 'ctrl+n', scope: 'file', action: { kind: 'command', command: { type: 'file:new' } }, visibleInHelp: true, visibleInWelcome: true },
  { id: 'file-open', label: '打开文件', display: 'Ctrl+O', chord: 'ctrl+o', scope: 'file', action: { kind: 'command', command: { type: 'file:open' } }, visibleInHelp: true, visibleInWelcome: true },
  { id: 'file-save', label: '保存', display: 'Ctrl+S', chord: 'ctrl+s', scope: 'file', action: { kind: 'command', command: { type: 'file:save' } }, visibleInHelp: true, visibleInWelcome: true },
  { id: 'file-save-as', label: '另存为', display: 'Ctrl+Shift+S', chord: 'ctrl+shift+s', scope: 'file', action: { kind: 'command', command: { type: 'file:save-as' } }, visibleInHelp: true, visibleInWelcome: true },
  { id: 'file-close-tab', label: '关闭当前标签', display: 'Ctrl+W', chord: 'ctrl+w', scope: 'file', action: { kind: 'internal', id: 'close-current-tab' }, visibleInHelp: true, visibleInWelcome: false },
  {
    id: 'tabs-cycle',
    label: '切换标签页',
    display: 'Ctrl+Tab',
    chord: 'ctrl+tab',
    scope: 'global',
    action: { kind: 'external', id: 'cycle-tabs' },
    dispatchMode: 'main-process',
    helpNote: 'Windows 下由主进程拦截',
    visibleInHelp: true,
    visibleInWelcome: true,
  },
  { id: 'edit-find', label: '查找', display: 'Ctrl+F', chord: 'ctrl+f', scope: 'editor', action: { kind: 'command', command: { type: 'edit:find' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'edit-replace', label: '替换', display: 'Ctrl+H', chord: 'ctrl+h', scope: 'editor', action: { kind: 'command', command: { type: 'edit:replace' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'view-cycle-mode', label: '切换编辑模式', display: 'Ctrl+E', chord: 'ctrl+e', scope: 'view', action: { kind: 'internal', id: 'cycle-editor-mode' }, visibleInHelp: true, visibleInWelcome: true },
  { id: 'table-open', label: '插入表格', display: 'Ctrl+T', chord: 'ctrl+t', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'table' } }, visibleInHelp: true, visibleInWelcome: true },
  { id: 'view-toggle-toc', label: '显示 / 隐藏大纲', display: 'Ctrl+Shift+\\', chord: 'ctrl+shift+\\', scope: 'view', action: { kind: 'command', command: { type: 'view:toggle-toc' } }, visibleInHelp: true, visibleInWelcome: true },
  { id: 'view-focus', label: '专注模式', display: 'Ctrl+Shift+F', chord: 'ctrl+shift+f', scope: 'view', action: { kind: 'command', command: { type: 'view:toggle-focus' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'view-sidebar', label: '显示 / 隐藏资源管理器', display: 'Ctrl+Shift+B', chord: 'ctrl+shift+b', scope: 'view', action: { kind: 'command', command: { type: 'view:toggle-sidebar' } }, visibleInHelp: true, visibleInWelcome: true },
  { id: 'theme-cycle', label: '切换主题', display: 'Ctrl+Shift+P', chord: 'ctrl+shift+p', scope: 'view', action: { kind: 'internal', id: 'cycle-theme' }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-promote-heading', label: '提升标题级别', display: 'Ctrl+=', chord: 'ctrl+=', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'promote-heading' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-demote-heading', label: '降低标题级别', display: 'Ctrl+-', chord: 'ctrl+-', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'demote-heading' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-paragraph', label: '段落', display: 'Ctrl+0', chord: 'ctrl+0', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'paragraph' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'heading-1', label: '一级标题', display: 'Ctrl+1', chord: 'ctrl+1', scope: 'editor', action: { kind: 'command', command: { type: 'paragraph:heading', level: 1 } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'heading-2', label: '二级标题', display: 'Ctrl+2', chord: 'ctrl+2', scope: 'editor', action: { kind: 'command', command: { type: 'paragraph:heading', level: 2 } }, visibleInHelp: false, visibleInWelcome: false },
  { id: 'heading-3', label: '三级标题', display: 'Ctrl+3', chord: 'ctrl+3', scope: 'editor', action: { kind: 'command', command: { type: 'paragraph:heading', level: 3 } }, visibleInHelp: false, visibleInWelcome: false },
  { id: 'heading-4', label: '四级标题', display: 'Ctrl+4', chord: 'ctrl+4', scope: 'editor', action: { kind: 'command', command: { type: 'paragraph:heading', level: 4 } }, visibleInHelp: false, visibleInWelcome: false },
  { id: 'heading-5', label: '五级标题', display: 'Ctrl+5', chord: 'ctrl+5', scope: 'editor', action: { kind: 'command', command: { type: 'paragraph:heading', level: 5 } }, visibleInHelp: false, visibleInWelcome: false },
  { id: 'heading-6', label: '六级标题', display: 'Ctrl+6', chord: 'ctrl+6', scope: 'editor', action: { kind: 'command', command: { type: 'paragraph:heading', level: 6 } }, visibleInHelp: false, visibleInWelcome: false },
  { id: 'format-bold', label: '加粗', display: 'Ctrl+B', chord: 'ctrl+b', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'bold' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-italic', label: '斜体', display: 'Ctrl+I', chord: 'ctrl+i', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'italic' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-underline', label: '下划线', display: 'Ctrl+U', chord: 'ctrl+u', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'underline' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-hyperlink', label: '超链接', display: 'Ctrl+K', chord: 'ctrl+k', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'hyperlink' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-code-block', label: '代码块', display: 'Ctrl+Shift+K', chord: 'ctrl+shift+k', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'code-block' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-math-block', label: '公式块', display: 'Ctrl+Shift+M', chord: 'ctrl+shift+m', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'math-block' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-blockquote', label: '引用', display: 'Ctrl+Shift+Q', chord: 'ctrl+shift+q', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'blockquote' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-task-list', label: '任务列表', display: 'Ctrl+Shift+X', chord: 'ctrl+shift+x', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'task-list' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-ordered-list', label: '有序列表', display: 'Ctrl+Shift+[', chord: 'ctrl+shift+[', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'ordered-list' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-unordered-list', label: '无序列表', display: 'Ctrl+Shift+]', chord: 'ctrl+shift+]', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'unordered-list' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-inline-code', label: '行内代码', display: 'Ctrl+Shift+`', chord: "ctrl+shift+`", scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'code' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-strikethrough', label: '删除线', display: 'Ctrl+Shift+5', chord: 'ctrl+shift+5', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'strikethrough' } }, visibleInHelp: true, visibleInWelcome: false },
  { id: 'format-clear', label: '清除样式', display: 'Ctrl+\\', chord: 'ctrl+\\', scope: 'editor', action: { kind: 'command', command: { type: 'format', command: 'clear-format' } }, visibleInHelp: true, visibleInWelcome: false },
]

function commandKey(cmd: AppCommandDetail): string {
  switch (cmd.type) {
    case 'file:open-recent':
      return `${cmd.type}:${cmd.path}`
    case 'paragraph:heading':
      return `${cmd.type}:${cmd.level}`
    case 'format':
      return `${cmd.type}:${cmd.command}`
    case 'file:export':
      return `${cmd.type}:${cmd.format}`
    case 'view:set-mode':
      return `${cmd.type}:${cmd.mode}`
    case 'theme:set':
      return `${cmd.type}:${cmd.theme}`
    default:
      return cmd.type
  }
}

/** 菜单等：根据菜单命令查找展示用快捷键文案 */
export function shortcutDisplayForAppCommand(command: AppCommandDetail): string {
  const key = commandKey(command)
  for (const s of SHORTCUTS) {
    if (s.action.kind !== 'command') continue
    if (commandKey(s.action.command) === key) return s.display
  }
  return ''
}

export function shortcutDisplayById(id: string): string {
  return SHORTCUTS.find(s => s.id === id)?.display ?? ''
}

export function findShortcutDefinitionByChord(chord: string | null): ShortcutDefinition | null {
  if (!chord) return null
  return (
    SHORTCUTS.find(s => {
      if (s.chord !== chord) return false
      const mode = s.dispatchMode ?? 'renderer-keydown'
      return mode === 'renderer-keydown'
    }) ?? null
  )
}

/** 帮助弹窗中合并展示，避免 H1~H6 占满一屏 */
const HELP_SKIP_IDS = new Set([
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'heading-5',
  'heading-6',
  'format-promote-heading',
  'format-demote-heading',
  'format-paragraph',
])

export function shortcutsForHelpDialog(): Array<{ keys: string; label: string }> {
  const head: Array<{ keys: string; label: string }> = [
    { keys: 'Ctrl+1~6', label: '设置标题 H1~H6' },
    { keys: 'Ctrl+0', label: '段落' },
    { keys: 'Ctrl+= / Ctrl+-', label: '提升 / 降低标题级别' },
  ]
  const rest = SHORTCUTS
    .filter(s => s.visibleInHelp && !HELP_SKIP_IDS.has(s.id))
    .map(s => ({
      keys: s.display,
      label: s.helpNote ? `${s.label}（${s.helpNote}）` : s.label,
    }))
  return [...head, ...rest]
}

export function shortcutsForWelcome(): Array<{ keys: string; label: string }> {
  return SHORTCUTS.filter(s => s.visibleInWelcome).map(s => ({ keys: s.display, label: s.label }))
}

/** README「常用快捷键」表格行：顺序与用户文档约定一致，「查找/替换」合并为一行 */
export function shortcutsForReadmeTable(): Array<{ keys: string; label: string }> {
  const pick = (id: string): ShortcutDefinition => {
    const s = SHORTCUTS.find(x => x.id === id)
    if (!s) throw new Error(`shortcutRegistry: 缺少 id「${id}」供 README 生成`)
    return s
  }
  const find = pick('edit-find')
  const rep = pick('edit-replace')
  return [
    { keys: pick('file-new').display, label: pick('file-new').label },
    { keys: pick('file-open').display, label: pick('file-open').label },
    { keys: pick('file-save').display, label: pick('file-save').label },
    { keys: pick('file-save-as').display, label: pick('file-save-as').label },
    { keys: pick('file-close-tab').display, label: pick('file-close-tab').label },
    { keys: pick('view-cycle-mode').display, label: '切换编辑模式（所见即所得 / 分栏 / 源码）' },
    { keys: `${find.display} / ${rep.display}`, label: '查找 / 替换' },
    { keys: pick('view-toggle-toc').display, label: '显示或隐藏 **大纲** 面板' },
    { keys: pick('view-sidebar').display, label: '显示或隐藏 **侧边栏**' },
    { keys: pick('view-focus').display, label: '**专注模式**（隐藏干扰元素，专心写作）' },
    { keys: pick('table-open').display, label: '打开 **表格** 插入工具' },
    { keys: pick('tabs-cycle').display, label: '在已打开的标签之间切换（配合 Shift 可反向切换）' },
    { keys: pick('theme-cycle').display, label: '循环切换内置 **主题**' },
  ]
}

export function validateShortcutRegistry(list: ShortcutDefinition[] = SHORTCUTS): void {
  const seen = new Map<string, string>()
  for (const s of list) {
    const existing = seen.get(s.chord)
    if (existing) {
      throw new Error(`快捷键冲突：${s.chord} 已用于 ${existing} 与 ${s.id}`)
    }
    seen.set(s.chord, s.id)
  }
}

if (import.meta.env?.DEV) {
  validateShortcutRegistry()
}
