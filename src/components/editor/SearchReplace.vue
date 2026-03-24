<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

interface SearchRequest {
  id: number
  mode: 'find' | 'replace'
}

interface MatchRange {
  start: number
  end: number
  text: string
}

const props = defineProps<{
  content: string
  request: SearchRequest | null
}>()

const emit = defineEmits<{
  close: []
  'update:content': [value: string]
  'reveal-match': [range: { start: number; end: number }]
  'ensure-source-mode': []
}>()

const visible = ref(false)
const query = ref('')
const replaceText = ref('')
const matchCase = ref(false)
const useRegex = ref(false)
const currentIndex = ref(0)
const queryInputRef = ref<HTMLInputElement>()

const regexError = computed(() => {
  if (!useRegex.value || !query.value) return ''
  try {
    new RegExp(query.value, matchCase.value ? 'g' : 'gi')
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : '正则表达式无效'
  }
})

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createPattern(global = true): RegExp | null {
  if (!query.value || regexError.value) return null
  const flags = `${global ? 'g' : ''}${matchCase.value ? '' : 'i'}`
  return new RegExp(useRegex.value ? query.value : escapeRegExp(query.value), flags)
}

const matches = computed<MatchRange[]>(() => {
  const pattern = createPattern(true)
  if (!pattern) return []

  const result: MatchRange[] = []
  for (const match of props.content.matchAll(pattern)) {
    if (match.index == null) continue
    const text = match[0]
    if (!text) continue
    result.push({
      start: match.index,
      end: match.index + text.length,
      text,
    })
    if (text.length === 0) break
  }
  return result
})

const currentMatch = computed(() => {
  if (matches.value.length === 0) return null
  const safeIndex = Math.min(currentIndex.value, matches.value.length - 1)
  return matches.value[safeIndex]
})

watch(matches, (nextMatches) => {
  if (nextMatches.length === 0) {
    currentIndex.value = 0
    return
  }
  if (currentIndex.value >= nextMatches.length) {
    currentIndex.value = nextMatches.length - 1
  }
})

watch(() => props.request, async (request) => {
  if (!request) return
  visible.value = true
  if (request.mode === 'replace') {
    await nextTick()
  }
  await nextTick()
  queryInputRef.value?.focus()
  queryInputRef.value?.select()
})

watch(currentMatch, async (match) => {
  if (!visible.value || !match) return
  emit('ensure-source-mode')
  await nextTick()
  emit('reveal-match', { start: match.start, end: match.end })
})

function closePanel() {
  visible.value = false
  emit('close')
}

function step(delta: number) {
  if (matches.value.length === 0) return
  currentIndex.value = (currentIndex.value + delta + matches.value.length) % matches.value.length
}

function applySingleReplacement(sourceText: string): string {
  if (useRegex.value) {
    const singlePattern = createPattern(false)
    return singlePattern ? sourceText.replace(singlePattern, replaceText.value) : sourceText
  }
  return replaceText.value
}

function replaceCurrent() {
  const match = currentMatch.value
  if (!match) return

  const replacement = applySingleReplacement(match.text)
  const nextContent = props.content.slice(0, match.start) + replacement + props.content.slice(match.end)
  emit('update:content', nextContent)

  nextTick(() => {
    const nextMatches = matches.value
    if (nextMatches.length === 0) return
    const nextIndex = Math.min(currentIndex.value, nextMatches.length - 1)
    currentIndex.value = nextIndex
  })
}

function replaceAll() {
  const pattern = createPattern(true)
  if (!pattern) return
  const nextContent = props.content.replace(pattern, replaceText.value)
  emit('update:content', nextContent)
  currentIndex.value = 0
}

function onQueryKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    step(event.shiftKey ? -1 : 1)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closePanel()
  }
}
</script>

<template>
  <div v-if="visible" class="search-panel">
    <div class="search-row">
      <input
        ref="queryInputRef"
        v-model="query"
        class="search-input"
        placeholder="搜索"
        @keydown="onQueryKeydown"
      />
      <span class="search-count">
        {{ matches.length === 0 ? '0 / 0' : `${currentIndex + 1} / ${matches.length}` }}
      </span>
      <button class="search-btn" :disabled="matches.length === 0" @click="step(-1)">上一个</button>
      <button class="search-btn" :disabled="matches.length === 0" @click="step(1)">下一个</button>
      <button class="search-btn close-btn" @click="closePanel">关闭</button>
    </div>

    <div v-if="request?.mode === 'replace'" class="search-row">
      <input
        v-model="replaceText"
        class="search-input"
        placeholder="替换为"
        @keydown.esc.prevent="closePanel"
      />
      <button class="search-btn primary" :disabled="!currentMatch" @click="replaceCurrent">替换</button>
      <button class="search-btn primary" :disabled="matches.length === 0" @click="replaceAll">全部替换</button>
    </div>

    <div class="search-row options-row">
      <label class="option-item">
        <input v-model="matchCase" type="checkbox" />
        <span>区分大小写</span>
      </label>
      <label class="option-item">
        <input v-model="useRegex" type="checkbox" />
        <span>正则</span>
      </label>
      <span v-if="regexError" class="search-error">{{ regexError }}</span>
    </div>
  </div>
</template>

<style scoped>
.search-panel {
  position: absolute;
  top: 16px;
  right: 20px;
  z-index: 220;
  min-width: 420px;
  max-width: min(680px, calc(100% - 40px));
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  font-size: 13px;
  background: var(--bg-secondary);
}

.search-count {
  min-width: 54px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

.search-btn {
  padding: 6px 10px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  transition: background var(--transition-fast);
}

.search-btn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-btn.primary {
  color: var(--accent-text);
  background: var(--accent-color);
}

.search-btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.options-row {
  min-height: 24px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.search-error {
  margin-left: auto;
  font-size: 12px;
  color: var(--danger-color);
}

.close-btn {
  margin-left: auto;
}
</style>
