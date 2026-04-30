import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/** ProseMirror 文档坐标：右键专项命令优先作用于此区间 */
export type PmStructuralRange = { from: number; to: number }

export const useEditorStore = defineStore('editor', () => {
  const cursorLine = ref(1)
  const cursorColumn = ref(1)
  const wordCount = ref(0)
  const charCount = ref(0)
  const lineCount = ref(0)
  const encoding = ref('UTF-8')
  const targetScrollLine = ref<number | null>(null)
  const searchRequest = ref<{ id: number; mode: 'find' | 'replace' } | null>(null)
  const headingRequest = ref<{ id: number; level: number } | null>(null)
  const formatRequest = ref<{
    id: number
    command: string
    data?: string
    pmRange?: PmStructuralRange
  } | null>(null)
  const statusToast = ref('')
  let statusToastTimer: ReturnType<typeof setTimeout> | null = null

  function showStatusToast(message: string, durationMs = 3200) {
    statusToast.value = message
    if (statusToastTimer) clearTimeout(statusToastTimer)
    statusToastTimer = setTimeout(() => {
      statusToast.value = ''
      statusToastTimer = null
    }, durationMs)
  }

  function updateCursor(line: number, column: number) {
    cursorLine.value = line
    cursorColumn.value = column
  }

  let statsTimer: ReturnType<typeof setTimeout> | null = null

  function updateStats(content: string) {
    if (statsTimer) clearTimeout(statsTimer)
    statsTimer = setTimeout(() => computeStats(content), 150)
  }

  function computeStats(content: string) {
    if (!content) {
      wordCount.value = 0
      charCount.value = 0
      lineCount.value = 0
      return
    }

    charCount.value = content.length
    lineCount.value = content.split('\n').length

    const chineseChars = content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)
    const englishWords = content.match(/[a-zA-Z]+/g)
    wordCount.value = (chineseChars?.length || 0) + (englishWords?.length || 0)
  }

  function requestScrollToLine(line: number) {
    targetScrollLine.value = line
  }

  function clearScrollRequest() {
    targetScrollLine.value = null
  }

  function requestSearch(mode: 'find' | 'replace') {
    searchRequest.value = { id: Date.now(), mode }
  }

  function clearSearchRequest() {
    searchRequest.value = null
  }

  function requestHeading(level: number) {
    headingRequest.value = { id: Date.now(), level }
  }

  function clearHeadingRequest() {
    headingRequest.value = null
  }

  function requestFormat(command: string, data?: string, pmRange?: PmStructuralRange) {
    formatRequest.value = { id: Date.now(), command, data, pmRange }
  }

  function clearFormatRequest() {
    formatRequest.value = null
  }

  const cursorPosition = computed(() => `${cursorLine.value}:${cursorColumn.value}`)

  return {
    cursorLine,
    cursorColumn,
    wordCount,
    charCount,
    lineCount,
    encoding,
    cursorPosition,
    targetScrollLine,
    searchRequest,
    headingRequest,
    formatRequest,
    statusToast,
    showStatusToast,
    updateCursor,
    updateStats,
    requestScrollToLine,
    clearScrollRequest,
    requestSearch,
    clearSearchRequest,
    requestHeading,
    clearHeadingRequest,
    requestFormat,
    clearFormatRequest,
  }
})
