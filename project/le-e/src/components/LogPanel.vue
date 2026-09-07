<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'
import stringWidth from 'string-width'
import { computed, watch } from 'vue'

import type { LogEntry } from '../application/logBuffer'
import type { ParsedTestResult } from '../domain/operation'
import { THEME } from '../styles/theme'

const props = defineProps<{
  logs: LogEntry[]
  testResult: ParsedTestResult | null
  x: number
  y: number
  width: number
  height: number
  focused: boolean
  scroll: number
}>()

const emit = defineEmits<{ focus: []; updateScroll: [value: number] }>()
const rows = computed(() => Math.max(1, props.height - 3))
const failed = computed(() => props.testResult?.outcome === 'failed')
watch(
  () => props.testResult,
  () => emit('updateScroll', 0),
)
const styleFor = (entry: LogEntry) => {
  if (entry.level === 'error') return THEME.error
  if (entry.level === 'warn') return THEME.warning
  if (entry.level === 'debug') return THEME.muted
  return THEME.normal
}
const lineFor = (entry: LogEntry): string => {
  const time = new Date(entry.timestamp).toLocaleTimeString('en-GB', { hour12: false })
  return `${time} ${entry.source ?? 'app'} ${entry.message}`
}

const displayRows = computed(() => {
  const output: { text: string; style: { fg: string; bold?: boolean } }[] = []
  const append = (text: string, style: { fg: string; bold?: boolean }) => {
    const width = Math.max(1, props.width - 4)
    for (const line of text.split('\n')) {
      let part = ''
      let cells = 0
      for (const character of line) {
        const size = stringWidth(character)
        if (cells + size > width && part) {
          output.push({ text: part, style })
          part = ''
          cells = 0
        }
        part += character
        cells += size
      }
      output.push({ text: part, style })
    }
  }
  const result = props.testResult
  if (result?.outcome === 'failed') {
    append(`✗ ${result.message}`, THEME.error)
    const fields = result.failedCase
    // CLI newlines may separate parameters, so do not infer individual test cases.
    const lines = (value: string) => value.replace(/↵/g, '\n').trimEnd().split('\n')
    if (fields?.input !== undefined) {
      append('┌ 输入', THEME.title)
      for (const line of lines(fields.input)) append(`│ ${line}`, THEME.warning)
    }
    const actual = fields?.actual === undefined ? [] : lines(fields.actual)
    const expected = fields?.expected === undefined ? [] : lines(fields.expected)
    if (fields?.actual !== undefined) {
      append('├ 实际输出', THEME.title)
      actual.forEach((line, index) => {
        const mismatch = fields.expected !== undefined && line !== expected[index]
        append(`${mismatch ? '✗' : '│'} ${line}`, mismatch ? THEME.error : THEME.muted)
      })
    }
    if (fields?.expected !== undefined) {
      append('├ 期望输出', THEME.title)
      expected.forEach((line, index) => {
        const mismatch = fields.actual !== undefined && line !== actual[index]
        append(`${mismatch ? '→' : '│'} ${line}`, mismatch ? THEME.success : THEME.muted)
      })
    }
    if (result.truncated) append('结果已截断，以下内容可能不完整。', THEME.warning)
    append('└ 原始日志（点击此窗口，↑↓/jk 滚动）', THEME.muted)
  }
  for (const entry of props.logs) append(lineFor(entry), styleFor(entry))
  return output
})
const start = computed(() => {
  const maximum = Math.max(0, displayRows.value.length - rows.value)
  return failed.value
    ? Math.min(maximum, Math.max(0, props.scroll))
    : Math.max(0, maximum - Math.max(0, props.scroll))
})
const visible = computed(() => displayRows.value.slice(start.value, start.value + rows.value))
watch([() => props.scroll, () => displayRows.value.length, rows], () => {
  const bounded = Math.min(
    Math.max(0, props.scroll),
    Math.max(0, displayRows.value.length - rows.value),
  )
  if (bounded !== props.scroll) emit('updateScroll', bounded)
})
</script>

<template>
  <TBox
    :x="x"
    :y="y"
    :w="width"
    :h="height"
    border
    :title="`${focused ? '> ' : ''}${failed ? '测试结果 · ↑↓/jk 滚动' : 'Log'} · ${logs.length}`"
    :padding="0"
    :style="focused ? THEME.borderActive : THEME.border"
    @click="emit('focus')"
  >
    <TText
      v-if="displayRows.length === 0"
      :x="1"
      :y="1"
      value="No command output yet."
      :style="THEME.muted"
    />
    <TText
      v-for="(entry, index) in visible"
      :key="start + index"
      :x="1"
      :y="index + 1"
      :w="Math.max(1, width - 2)"
      :value="entry.text"
      :style="entry.style"
    />
  </TBox>
</template>
