<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { renderMarkdown, setHighlightTheme } from '@/utils/markdown'
import { useSettingsStore } from '@/stores/settings'
import mermaid from 'mermaid'

const props = defineProps<{
  content: string
  syncScrollRatio?: number
}>()

const emit = defineEmits<{
  'scroll': [scrollInfo: { scrollTop: number; scrollHeight: number; clientHeight: number }]
}>()

const settingsStore = useSettingsStore()
const previewRef = ref<HTMLDivElement>()
let isSyncScroll = false
let mermaidCounter = 0
let currentMermaidTheme: string | null = null

const renderedContent = ref('')
let renderTimer: ReturnType<typeof setTimeout> | null = null
let isFirstRender = true

function doRender() {
  setHighlightTheme(settingsStore.theme)
  renderedContent.value = renderMarkdown(props.content || '')
}

function scheduleRender() {
  if (isFirstRender) {
    isFirstRender = false
    doRender()
    return
  }
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(doRender, 80)
}

watch(() => props.content, scheduleRender, { immediate: true })
watch(() => settingsStore.theme, scheduleRender)

async function renderMermaidBlocks() {
  if (!previewRef.value) return

  const isDarkish = settingsStore.theme === 'dark' || settingsStore.theme === 'nord'
  const mermaidTheme = isDarkish ? 'dark' : 'default'
  if (currentMermaidTheme !== mermaidTheme) {
    mermaid.initialize({
      startOnLoad: false,
      theme: mermaidTheme,
      securityLevel: 'strict',
      fontFamily: 'var(--font-family)',
    })
    currentMermaidTheme = mermaidTheme
  }

  const blocks = previewRef.value.querySelectorAll('.mermaid-pending')
  for (const block of blocks) {
    const codeEl = block.querySelector('code')
    const content = codeEl?.textContent || block.textContent || ''
    if (!content.trim()) continue

    try {
      const id = `mermaid-svg-${++mermaidCounter}`
      const { svg } = await mermaid.render(id, content.trim())
      const wrapper = document.createElement('div')
      wrapper.innerHTML = svg
      const svgEl = wrapper.querySelector('svg')
      if (svgEl) {
        svgEl.removeAttribute('onload')
        svgEl.removeAttribute('onerror')
        block.textContent = ''
        block.appendChild(svgEl)
      }
      block.classList.remove('mermaid-pending')
      block.classList.add('mermaid-rendered')
    } catch {
      block.textContent = ''
      const errorPre = document.createElement('pre')
      errorPre.className = 'mermaid-error'
      errorPre.textContent = content
      block.appendChild(errorPre)
      block.classList.remove('mermaid-pending')
      block.classList.add('mermaid-error-block')
    }
  }
}

watch(renderedContent, async () => {
  await nextTick()
  renderMermaidBlocks()
})

watch(() => props.syncScrollRatio, (ratio) => {
  if (ratio == null || !previewRef.value) return
  isSyncScroll = true
  const maxScroll = Math.max(0, previewRef.value.scrollHeight - previewRef.value.clientHeight)
  previewRef.value.scrollTop = maxScroll * ratio
  requestAnimationFrame(() => { isSyncScroll = false })
})

function onScroll() {
  if (isSyncScroll || !previewRef.value) return
  emit('scroll', {
    scrollTop: previewRef.value.scrollTop,
    scrollHeight: previewRef.value.scrollHeight,
    clientHeight: previewRef.value.clientHeight,
  })
}

onMounted(() => {
  previewRef.value?.addEventListener('scroll', onScroll, { passive: true })
  renderMermaidBlocks()
})

onUnmounted(() => {
  previewRef.value?.removeEventListener('scroll', onScroll)
  if (renderTimer) clearTimeout(renderTimer)
})
</script>

<template>
  <div ref="previewRef" class="markdown-preview">
    <div class="preview-content" v-html="renderedContent"></div>
  </div>
</template>

<style scoped>
.markdown-preview {
  flex: 1;
  overflow-y: auto;
  padding: 24px 36px;
  background: var(--editor-bg);
  user-select: text;
}
</style>

<style>
.preview-content {
  max-width: 800px;
  margin: 0 auto;
  color: var(--text-primary);
  font-size: var(--font-size-editor);
  line-height: 1.8;
}

.preview-content h1 {
  font-size: 2em;
  font-weight: 700;
  margin: 1em 0 0.5em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--border-color);
}

.preview-content h2 {
  font-size: 1.5em;
  font-weight: 600;
  margin: 0.8em 0 0.4em;
  padding-bottom: 0.25em;
  border-bottom: 1px solid var(--border-light);
}

.preview-content h3 { font-size: 1.25em; font-weight: 600; margin: 0.8em 0 0.4em; }
.preview-content h4 { font-size: 1.1em; font-weight: 600; margin: 0.6em 0 0.3em; }
.preview-content h5 { font-size: 1em; font-weight: 600; margin: 0.5em 0 0.3em; }
.preview-content h6 { font-size: 0.9em; font-weight: 600; margin: 0.5em 0 0.3em; color: var(--text-secondary); }

.preview-content p {
  margin: 0.6em 0;
}

.preview-content strong { font-weight: 600; }
.preview-content em { font-style: italic; }
.preview-content del { text-decoration: line-through; color: var(--text-muted); }

.preview-content a {
  color: var(--accent-color);
  text-decoration: none;
}

.preview-content a:hover {
  text-decoration: underline;
}

.preview-content blockquote {
  margin: 0.8em 0;
  padding: 0.5em 1em;
  border-left: 4px solid var(--accent-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.preview-content blockquote p {
  margin: 0.3em 0;
}

.preview-content ul, .preview-content ol {
  margin: 0.6em 0;
  padding-left: 2em;
}

.preview-content li {
  margin: 0.25em 0;
}

.preview-content code {
  font-family: var(--font-family-mono);
  font-size: 0.9em;
  padding: 2px 6px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--accent-color);
}

.preview-content .code-block {
  position: relative;
  margin: 1em 0;
  padding: 16px 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow-x: auto;
}

.preview-content .code-block code {
  padding: 0;
  background: none;
  color: var(--text-primary);
  font-size: 0.85em;
  line-height: 1.6;
}

.preview-content .code-block .code-lang {
  position: absolute;
  top: 6px;
  right: 10px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-family);
  pointer-events: none;
}

.preview-content table {
  width: 100%;
  margin: 1em 0;
  border-collapse: collapse;
}

.preview-content th, .preview-content td {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  text-align: left;
}

.preview-content th {
  background: var(--bg-secondary);
  font-weight: 600;
}

.preview-content tr:nth-child(2n) {
  background: var(--bg-secondary);
}

.preview-content img {
  max-width: 100%;
  border-radius: var(--radius-md);
  margin: 0.5em 0;
}

.preview-content hr {
  margin: 1.5em 0;
  border: none;
  border-top: 1px solid var(--border-color);
}

.preview-content input[type="checkbox"] {
  margin-right: 6px;
  vertical-align: middle;
}
</style>
