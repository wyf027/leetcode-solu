<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'
import { computed } from 'vue'

import type { LogEntry } from '../application/logBuffer'
import { THEME } from '../styles/theme'

const props = defineProps<{
  logs: LogEntry[]
  x: number
  y: number
  width: number
  height: number
  focused: boolean
  scroll: number
}>()

const rows = computed(() => Math.max(1, props.height - 2))
const start = computed(() =>
  Math.max(0, props.logs.length - rows.value - Math.max(0, props.scroll)),
)
const visible = computed(() => props.logs.slice(start.value, start.value + rows.value))
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
</script>

<template>
  <TBox
    :x="x"
    :y="y"
    :w="width"
    :h="height"
    border
    :title="`${focused ? '> ' : ''}Log · ${logs.length}`"
    :padding="0"
    :style="focused ? THEME.borderActive : THEME.border"
  >
    <TText
      v-if="logs.length === 0"
      :x="1"
      :y="1"
      value="No command output yet."
      :style="THEME.muted"
    />
    <TText
      v-for="entry in visible"
      :key="entry.id"
      :x="1"
      :y="visible.indexOf(entry) + 1"
      :w="Math.max(1, width - 2)"
      :value="lineFor(entry)"
      :style="styleFor(entry)"
    />
  </TBox>
</template>
