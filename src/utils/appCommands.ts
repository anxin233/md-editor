import type { EditorMode, ThemeMode } from '@/stores/settings'

export type AppCommandDetail =
  | { type: 'file:new' }
  | { type: 'file:open' }
  | { type: 'file:open-folder' }
  | { type: 'file:save' }
  | { type: 'file:save-as' }
  | { type: 'file:open-recent'; path: string }
  | { type: 'file:export'; format: 'pdf' | 'html' | 'word' }
  | { type: 'edit:find' }
  | { type: 'edit:replace' }
  | { type: 'view:set-mode'; mode: EditorMode }
  | { type: 'view:toggle-sidebar' }
  | { type: 'view:toggle-toc' }
  | { type: 'view:toggle-focus' }
  | { type: 'view:toggle-typewriter' }
  | { type: 'view:font-inc' }
  | { type: 'view:font-dec' }
  | { type: 'view:font-reset' }
  | { type: 'theme:set'; theme: ThemeMode }
  | { type: 'theme:pick-custom' }
  | { type: 'theme:clear-custom' }

const APP_COMMAND_EVENT = 'md-editor:command'

export function dispatchAppCommand(detail: AppCommandDetail) {
  window.dispatchEvent(new CustomEvent<AppCommandDetail>(APP_COMMAND_EVENT, { detail }))
}

export function listenAppCommand(handler: (detail: AppCommandDetail) => void) {
  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<AppCommandDetail>
    handler(customEvent.detail)
  }

  window.addEventListener(APP_COMMAND_EVENT, listener)
  return () => window.removeEventListener(APP_COMMAND_EVENT, listener)
}
