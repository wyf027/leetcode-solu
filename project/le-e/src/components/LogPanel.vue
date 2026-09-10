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
    if (!fields && result.details) append(result.details, THEME.error)
    const lines = (value: string) => value.trimEnd().split('\n')
    const inputs = fields?.input === undefined ? [] : lines(fields.input)
    const actual = fields?.actual === undefined ? [] : lines(fields.actual)
    const expected = fields?.expected === undefined ? [] : lines(fields.expected)
    // CLI emits one answer per case; input rows can be multiple parameters per case.
    // Only group complete JSON rows with matching counts; ambiguous/truncated output stays intact.
    const completeJson = (value: string) => {
      try {
        JSON.parse(value)
        return true
      } catch {
        return false
      }
    }
    const grouped =
      !result.truncated &&
      actual.length > 0 &&
      actual.length === expected.length &&
      inputs.length >= actual.length &&
      inputs.length % actual.length === 0 &&
      [...inputs, ...actual, ...expected].every(completeJson)
    if (grouped) {
      const parameterCount = inputs.length / actual.length
      actual.forEach((value, index) => {
        if (index > 0) append('', THEME.normal)
        append(`┌ 用例 ${index + 1}`, THEME.title)
        const parameters = inputs.slice(index * parameterCount, (index + 1) * parameterCount)
        parameters.forEach((parameter, parameterIndex) =>
          append(
            `│ 输入${parameterCount > 1 ? ` ${parameterIndex + 1}` : ''}: ${parameter}`,
            THEME.warning,
          ),
        )
        const mismatch = value.trim() !== expected[index]?.trim()
        append(`│ 实际输出: ${value}`, mismatch ? THEME.error : THEME.muted)
        append(`└ 期望输出: ${expected[index]}`, mismatch ? THEME.success : THEME.muted)
      })
      return output
    }
    if (fields?.input !== undefined) {
      append('┌ 输入', THEME.title)
      for (const line of lines(fields.input)) append(`│ ${line}`, THEME.warning)
    }
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
    return output
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
