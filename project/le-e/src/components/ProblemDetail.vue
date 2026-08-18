<script setup lang="ts">
import { TBox, TText, TView } from '@simon_he/vue-tui'
import { computed } from 'vue'

import type { ParsedTestResult } from '../domain/operation'
import type { ProblemDetail as ProblemDetailModel, ProblemSummary } from '../domain/problem'
import { THEME } from '../styles/theme'

const props = defineProps<{
  problem: ProblemSummary | null
  detail: ProblemDetailModel | null
  x: number
  y: number
  width: number
  height: number
  focused: boolean
  scroll: number
  sourceReady: boolean
  testStatus: string
  testResult: ParsedTestResult | null
  submissionStatus: string
  favoriteActive: boolean
  favoriteWritable: boolean
  favoriteFolderName: string
}>()

const emit = defineEmits<{ toggleFavorite: [] }>()

const heading = computed(() => {
  if (props.problem === null) return 'Select a problem.'
  const source = props.sourceReady ? 'source ready' : 'press e to prepare source'
  const title = props.detail?.localizedTitle ?? props.problem.localizedTitle ?? props.problem.title
  return `[${props.problem.id}] ${title} · ${props.problem.difficulty} · ${source}`
})

const statement = computed(() => {
  if (props.problem === null) return 'Use ↑/↓ or j/k to select a problem.'
  if (props.detail === null) return 'Press Enter to load the problem statement.'
  return props.detail.statement || 'The CLI returned an empty problem statement.'
})

const failedCase = computed(() => {
  const result = props.testResult
  if (result?.outcome !== 'failed') return ''
  const lines = [`── 未通过的用例 ──`, `结果: ${result.message}`]
  if (result.failedCase?.input !== undefined) lines.push(`输入: ${result.failedCase.input}`)
  if (result.failedCase?.actual !== undefined) lines.push(`实际输出: ${result.failedCase.actual}`)
  if (result.failedCase?.expected !== undefined)
    lines.push(`期望输出: ${result.failedCase.expected}`)
  return lines.join('\n')
})

const content = computed(() =>
  failedCase.value === '' ? statement.value : `${failedCase.value}\n\n${statement.value}`,
)

const favoriteLabel = computed(() => {
  if (!props.favoriteWritable) return `☆ ${props.favoriteFolderName} 为只读收藏夹`
  return props.favoriteActive
    ? `★ 已收藏到 ${props.favoriteFolderName} · 点击或按 a 取消`
    : `☆ 点击或按 a 收藏到 ${props.favoriteFolderName}`
})
</script>

<template>
  <TBox
    :x="x"
    :y="y"
    :w="width"
    :h="height"
    border
    :title="`${focused ? '> ' : ''}Detail · test ${testStatus} · submit ${submissionStatus}`"
    :padding="0"
    :style="focused ? THEME.borderActive : THEME.border"
    :scroll-y="scroll"
  >
    <TText :x="1" :y="1" :w="Math.max(1, width - 2)" :value="heading" :style="THEME.title" />
    <TView
      :x="1"
      :y="2"
      :w="Math.max(1, width - 2)"
      :h="1"
      @click="favoriteWritable && emit('toggleFavorite')"
    >
      <TText
        :x="0"
        :y="0"
        :w="Math.max(1, width - 2)"
        :value="favoriteLabel"
        :style="favoriteActive ? THEME.warning : THEME.muted"
      />
    </TView>
    <TText
      :x="1"
      :y="4"
      :w="Math.max(1, width - 2)"
      :h="Math.max(1, height - 5)"
      :value="content"
      wrap
    />
  </TBox>
</template>
