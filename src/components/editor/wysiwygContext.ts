import type { InjectionKey, Ref } from 'vue'

export const wysiwygScrollContainerKey: InjectionKey<Ref<HTMLElement | undefined>> =
  Symbol('wysiwygScrollContainer')
