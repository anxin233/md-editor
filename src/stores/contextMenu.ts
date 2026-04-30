import { defineStore } from 'pinia'
import { ref, nextTick } from 'vue'

export interface ContextMenuEntry {
  id: string
  label: string
  disabled?: boolean
  danger?: boolean
  separatorBefore?: boolean
  /** 叶子项点击时执行；有 `children` 时可为空 */
  action?: () => void | Promise<void>
  children?: ContextMenuEntry[]
}

function countMenuRows(items: ContextMenuEntry[]): number {
  let n = 0
  for (const it of items) {
    n++
    if (it.children?.length) n += countMenuRows(it.children)
  }
  return n
}

export const useContextMenuStore = defineStore('contextMenu', () => {
  const visible = ref(false)
  const x = ref(0)
  const y = ref(0)
  const items = ref<ContextMenuEntry[]>([])

  function hide() {
    visible.value = false
    window.removeEventListener('click', onDocPointer, true)
    window.removeEventListener('contextmenu', onDocPointer, true)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('scroll', onScroll, true)
  }

  function onDocPointer(ev: MouseEvent) {
    const t = ev.target as HTMLElement | null
    if (t?.closest?.('.context-menu-root')) return
    hide()
  }

  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') hide()
  }

  function onScroll() {
    hide()
  }

  function show(opts: { clientX: number; clientY: number; items: ContextMenuEntry[] }) {
    hide()
    items.value = opts.items
    const menuW = 260
    const rows = Math.max(4, countMenuRows(opts.items))
    const menuH = Math.min(560, 24 + rows * 34)
    const pad = 8
    let nx = opts.clientX
    let ny = opts.clientY
    if (nx + menuW > window.innerWidth - pad) nx = window.innerWidth - menuW - pad
    if (ny + menuH > window.innerHeight - pad) ny = window.innerHeight - menuH - pad
    if (nx < pad) nx = pad
    if (ny < pad) ny = pad
    x.value = nx
    y.value = ny
    visible.value = true

    nextTick(() => {
      window.addEventListener('click', onDocPointer, true)
      window.addEventListener('contextmenu', onDocPointer, true)
      window.addEventListener('keydown', onKey)
      window.addEventListener('scroll', onScroll, true)
    })
  }

  return { visible, x, y, items, show, hide }
})
