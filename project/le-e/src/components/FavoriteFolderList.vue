<script setup lang="ts">
import { TBox, TText, TView } from '@simon_he/vue-tui'
import stringWidth from 'string-width'
import { computed, ref, watch } from 'vue'

import type { FavoriteFolder } from '../domain/favorite'
import { THEME } from '../styles/theme'
import { borderedListContentRows, nextListWindowStart } from './listViewport'

const props = defineProps<{
  folders: FavoriteFolder[]
  selectedSlug: string | null
  x: number
  y: number
  width: number
  height: number
  focused: boolean
  loading: boolean
}>()

const emit = defineEmits<{ open: [slug: string] }>()

// Rows start at y=1 inside a bordered TBox, so the last drawable row is height - 3.
const contentRows = computed(() => borderedListContentRows(props.height))
const selectedIndex = computed(() =>
  props.folders.findIndex(({ slug }) => slug === props.selectedSlug),
)
const start = ref(0)
defineExpose({
  scrollBy(delta: number) {
    if (props.loading) return
    start.value = Math.max(
      0,
      Math.min(Math.max(0, props.folders.length - contentRows.value), start.value + delta),
    )
  },
})
watch(
  [selectedIndex, contentRows, () => props.folders.length],
  ([index, rows, length]) => {
    start.value = nextListWindowStart(start.value, index, rows, length)
  },
  { immediate: true },
)
const visible = computed(() => props.folders.slice(start.value, start.value + contentRows.value))

const clip = (value: string, width: number): string => {
  if (stringWidth(value) <= width) return value
  let output = ''
  for (const character of value) {
    if (stringWidth(`${output}${character}…`) > width) break
    output += character
  }
  return `${output}…`
}

const rowText = (folder: FavoriteFolder): string => {
  const marker = folder.slug === props.selectedSlug ? '>' : ' '
  const suffix = `${folder.questions.length} 题${folder.writable ? '' : ' · 只读'}`
  const nameWidth = Math.max(4, props.width - 4 - stringWidth(marker) - stringWidth(suffix))
  const name = clip(folder.name, nameWidth)
  return `${marker} ${name}${' '.repeat(Math.max(1, nameWidth - stringWidth(name) + 1))}${suffix}`
}
</script>

<template>
  <TBox
    :x="x"
    :y="y"
    :w="width"
    :h="height"
    border
    :title="`${focused ? '> ' : ''}收藏夹 · ${folders.length}`"
    :padding="0"
    :style="focused ? THEME.borderActive : THEME.border"
  >
    <TText v-if="loading" :x="1" :y="1" value="◐ 加载收藏夹中…" :style="THEME.warning" />
    <TText
      v-else-if="folders.length === 0"
      :x="1"
      :y="1"
      value="暂无收藏夹。请确认 LeetCode 已登录。"
      :style="THEME.muted"
    />
    <TView
      v-for="(folder, index) in visible"
      v-show="!loading"
      :key="folder.slug"
      :x="1"
      :y="index + 1"
      :w="Math.max(1, width - 2)"
      :h="1"
      @click="emit('open', folder.slug)"
    >
      <TText
        :x="0"
        :y="0"
        :w="Math.max(1, width - 2)"
        :value="rowText(folder)"
        :style="folder.slug === selectedSlug ? THEME.selected : THEME.normal"
      />
    </TView>
  </TBox>
</template>
