<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'
import stringWidth from 'string-width'
import { computed, ref, watch } from 'vue'

import type { ProblemSummary } from '../domain/problem'
import { THEME } from '../styles/theme'
import { borderedListContentRows, nextListWindowStart } from './listViewport'

const props = defineProps<{
  problems: ProblemSummary[]
  selectedId: number | null
  x: number
  y: number
  width: number
  height: number
  focused: boolean
  loading: boolean
  title?: string
}>()

// Rows start at y=1 inside a bordered TBox, so the last drawable row is height - 3.
const contentRows = computed(() => borderedListContentRows(props.height))
const selectedIndex = computed(() => props.problems.findIndex(({ id }) => id === props.selectedId))
const start = ref(0)
defineExpose({
  scrollBy(delta: number) {
    if (props.loading) return
    start.value = Math.max(
      0,
      Math.min(Math.max(0, props.problems.length - contentRows.value), start.value + delta),
    )
  },
})
watch(
  [selectedIndex, contentRows, () => props.problems.length],
  ([index, rows, length]) => {
    start.value = nextListWindowStart(start.value, index, rows, length)
  },
  { immediate: true },
)
const visible = computed(() => props.problems.slice(start.value, start.value + contentRows.value))

const clip = (value: string, width: number): string => {
  if (stringWidth(value) <= width) return value
  let output = ''
  for (const character of value) {
    if (stringWidth(`${output}${character}…`) > width) break
    output += character
  }
  return `${output}…`
}

const rowText = (problem: ProblemSummary): string => {
  const marker = problem.id === props.selectedId ? '>' : ' '
  const starred = problem.starred ? '★' : ' '
  const solved =
    problem.solveStatus === 'solved' ? '✓' : problem.solveStatus === 'attempted' ? '~' : ' '
  const prefix = `${marker}${starred}${solved} ${String(problem.id).padStart(4)} `
  const difficulty = problem.difficulty.padEnd(6)
  const titleWidth = Math.max(
    8,
    props.width - 2 - stringWidth(prefix) - stringWidth(difficulty) - 1,
  )
  const title = clip(problem.localizedTitle ?? problem.title, titleWidth)
  const paddedTitle = `${title}${' '.repeat(Math.max(0, titleWidth - stringWidth(title)))}`
  return `${prefix}${paddedTitle} ${difficulty}`
}

const rowStyle = (problem: ProblemSummary) => {
  if (problem.id === props.selectedId) return THEME.selected
  if (problem.difficulty === 'Easy') return THEME.easy
  if (problem.difficulty === 'Medium') return THEME.medium
  return THEME.hard
}
</script>

<template>
  <TBox
    :x="x"
    :y="y"
    :w="width"
    :h="height"
    border
    :title="`${focused ? '> ' : ''}${title ?? 'Problems'} · ${problems.length}`"
    :padding="0"
    :style="focused ? THEME.borderActive : THEME.border"
  >
    <TText v-if="loading" :x="1" :y="1" value="◐ 加载题目中…" :style="THEME.warning" />
    <TText
      v-else-if="problems.length === 0"
      :x="1"
      :y="1"
      value="No matching problems."
      :style="THEME.muted"
    />
    <TText
      v-for="(problem, index) in visible"
      v-show="!loading"
      :key="problem.id"
      :x="1"
      :y="index + 1"
      :w="Math.max(1, width - 2)"
      :value="rowText(problem)"
      :style="rowStyle(problem)"
    />
  </TBox>
</template>
