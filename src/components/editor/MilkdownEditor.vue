<script setup lang="ts">
import { watch } from 'vue'
import { useEditor, useInstance } from '@milkdown/vue'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { replaceAll } from '@milkdown/utils'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { indent } from '@milkdown/plugin-indent'
import { trailing } from '@milkdown/plugin-trailing'
import { Milkdown } from '@milkdown/vue'
import { useEditorStore } from '@/stores/editor'

const editorStore = useEditorStore()

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

let isInternalUpdate = false
let lastEmittedValue = ''

useEditor((root) => {
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, props.modelValue)
      lastEmittedValue = props.modelValue
      ctx.get(listenerCtx)
        .markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (markdown !== prevMarkdown) {
            isInternalUpdate = true
            lastEmittedValue = markdown
            emit('update:modelValue', markdown)
            isInternalUpdate = false
          }
        })
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(indent)
    .use(trailing)

  return editor
})

const [loading, getEditor] = useInstance()

watch(() => props.modelValue, (newVal) => {
  if (isInternalUpdate) return
  if (newVal === lastEmittedValue) return
  if (loading.value) return

  const editor = getEditor()
  if (editor) {
    try {
      editor.action(replaceAll(newVal))
      lastEmittedValue = newVal
    } catch {
      // editor might not be ready
    }
  }
})

function setHeading(level: number) {
  const editor = getEditor()
  if (!editor || loading.value) return

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const { schema, selection } = state
    const { $from, $to } = selection

    const headingType = schema.nodes.heading
    const paragraphType = schema.nodes.paragraph
    if (!headingType || !paragraphType) return

    const isSameHeading = $from.parent.type === headingType
      && $from.parent.attrs.level === level

    const tr = state.tr
    tr.setBlockType(
      $from.pos,
      $to.pos,
      isSameHeading ? paragraphType : headingType,
      isSameHeading ? undefined : { level }
    )
    dispatch(tr)
    view.focus()
  })
}

watch(() => editorStore.headingRequest, (req) => {
  if (!req) return
  setHeading(req.level)
  editorStore.clearHeadingRequest()
})
</script>

<template>
  <Milkdown />
</template>
