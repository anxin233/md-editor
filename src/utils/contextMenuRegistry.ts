import type { EditorView } from '@codemirror/view'
import { selectAll } from '@codemirror/commands'
import type { ContextMenuEntry } from '@/stores/contextMenu'
import { useEditorStore } from '@/stores/editor'

/** CodeMirror 编辑区：剪切 / 复制 / 粘贴 / 删除 / 全选 */
export function buildCodeMirrorTextMenu(view: EditorView): ContextMenuEntry[] {
  const sel = view.state.selection.main
  const hasSel = !sel.empty
  const from = sel.from
  const to = sel.to

  return [
    {
      id: 'cut',
      label: '剪切',
      disabled: !hasSel,
      action: async () => {
        if (!hasSel) return
        const text = view.state.sliceDoc(from, to)
        await navigator.clipboard.writeText(text)
        view.dispatch({ changes: { from, to, insert: '' } })
        view.focus()
      },
    },
    {
      id: 'copy',
      label: '复制',
      disabled: !hasSel,
      action: async () => {
        if (!hasSel) return
        await navigator.clipboard.writeText(view.state.sliceDoc(from, to))
      },
    },
    {
      id: 'paste',
      label: '粘贴',
      action: async () => {
        let text = ''
        try {
          text = await navigator.clipboard.readText()
        } catch {
          return
        }
        view.dispatch(view.state.replaceSelection(text))
        view.focus()
      },
    },
    {
      id: 'delete',
      label: '删除',
      disabled: !hasSel,
      action: () => {
        if (!hasSel) return
        view.dispatch({ changes: { from, to, insert: '' } })
        view.focus()
      },
    },
    {
      id: 'select-all',
      label: '全选',
      separatorBefore: true,
      action: () => {
        selectAll(view)
        view.focus()
      },
    },
  ]
}

/** WYSIWYG（ProseMirror 容器内选区）：剪切/复制/删除仍用 execCommand；粘贴走剪贴板 API + Milkdown 插入 */
export function buildWysiwygTextMenu(pm: HTMLElement, _event: MouseEvent): ContextMenuEntry[] {
  const sel = window.getSelection()
  const anchorInPm = sel?.anchorNode && pm.contains(sel.anchorNode)
  const hasSel = !!(sel && !sel.isCollapsed && anchorInPm)

  const focusPm = () => {
    pm.focus()
  }

  return [
    {
      id: 'cut',
      label: '剪切',
      disabled: !hasSel,
      action: () => {
        focusPm()
        document.execCommand('cut')
      },
    },
    {
      id: 'copy',
      label: '复制',
      disabled: !hasSel,
      action: () => {
        focusPm()
        document.execCommand('copy')
      },
    },
    {
      id: 'paste',
      label: '粘贴',
      action: async () => {
        const editorStore = useEditorStore()
        pm.focus()
        let text = ''
        try {
          text = await navigator.clipboard.readText()
        } catch {
          editorStore.showStatusToast('无法读取剪贴板，请检查权限')
          return
        }
        editorStore.requestFormat('wysiwyg-insert-text', text)
      },
    },
    {
      id: 'delete',
      label: '删除',
      disabled: !hasSel,
      action: () => {
        focusPm()
        document.execCommand('delete')
      },
    },
    {
      id: 'select-all',
      label: '全选',
      separatorBefore: true,
      action: () => {
        focusPm()
        document.execCommand('selectAll')
      },
    },
  ]
}
