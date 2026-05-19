import type { EditorView } from '@milkdown/prose/view'

function isScrollable(el: HTMLElement): boolean {
  const { overflowY } = getComputedStyle(el)
  if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') {
    return false
  }
  return el.scrollHeight > el.clientHeight + 2
}

/** Pick the nearest ancestor that can actually scroll (flex child may grow without min-height: 0). */
export function resolveWysiwygScrollContainer(
  preferred: HTMLElement | null | undefined,
  view: EditorView,
  pos: number,
): HTMLElement | null {
  const seen = new Set<HTMLElement>()
  const candidates: HTMLElement[] = []

  const push = (el: HTMLElement | null | undefined) => {
    if (el && !seen.has(el)) {
      seen.add(el)
      candidates.push(el)
    }
  }

  push(preferred ?? undefined)

  let dom: Node | null = view.nodeDOM(pos)
  if (dom && dom.nodeType !== 1) {
    dom = dom.parentElement
  }
  let el = dom instanceof HTMLElement ? dom : null
  while (el) {
    push(el)
    if (el === preferred) break
    el = el.parentElement
  }

  for (const node of candidates) {
    if (isScrollable(node)) return node
  }

  return preferred ?? null
}

/** Scroll so the document position is near the vertical center of the scroll container. */
export function scrollWysiwygToPosition(
  scrollEl: HTMLElement,
  view: EditorView,
  pos: number,
): boolean {
  let dom: Node | null = view.nodeDOM(pos)
  if (dom && dom.nodeType !== 1) {
    dom = dom.parentElement
  }

  if (dom instanceof HTMLElement && scrollEl.contains(dom)) {
    const elRect = dom.getBoundingClientRect()
    const scrollRect = scrollEl.getBoundingClientRect()
    const contentTop = scrollEl.scrollTop + elRect.top - scrollRect.top
    const targetScrollTop = contentTop - scrollEl.clientHeight / 2 + elRect.height / 2
    const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
    scrollEl.scrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll))
    return true
  }

  const coords = view.coordsAtPos(pos, 1)
  if (!coords) return false

  const scrollRect = scrollEl.getBoundingClientRect()
  const contentTop = scrollEl.scrollTop + coords.top - scrollRect.top
  const lineHeight = Math.max(coords.bottom - coords.top, 1)
  const targetScrollTop = contentTop - scrollEl.clientHeight / 2 + lineHeight / 2
  const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
  scrollEl.scrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll))
  return true
}
