<script setup lang="ts">
import { TBox, TText, TView } from '@simon_he/vue-tui'
import stringWidth from 'string-width'
import { computed } from 'vue'

import type { AppControllerState } from '../application/createAppController'
import { THEME } from '../styles/theme'
import { LANGUAGES } from '../config/languages'

const props = defineProps<{
  state: AppControllerState
  width: number
  focused: boolean
  searchMode: boolean
  searchDraft: string
}>()

const emit = defineEmits<{ openDaily: [] }>()

const statusText = (): string => {
  if (props.state.activeOperation !== null) return `Running ${props.state.activeOperation}`
  if (props.state.phase === 'error') return 'Error'
  if (props.state.stale) return 'Ready · stale data'
  return props.state.phase === 'ready' ? 'Ready' : 'Starting'
}

const favoriteFolderName = (): string =>
  props.state.favoriteFolders.find(({ slug }) => slug === props.state.selectedFavoriteFolderSlug)
    ?.name ?? '无'

const clip = (value: string, width: number): string => {
  if (stringWidth(value) <= width) return value
  let output = ''
  for (const character of value) {
    if (stringWidth(`${output}${character}…`) > width) break
    output += character
  }
  return `${output}…`
}

const dailyClickable = computed(
  () => !props.state.dailyLoading && !props.state.dailyError && props.state.dailyProblem !== null,
)

const dailyProblemText = (): string => {
  if (props.state.dailyLoading) return '每日一题: 加载中…'
  if (props.state.dailyError) return `每日一题: ${props.state.dailyError}`
  const daily = props.state.dailyProblem
  return daily === null
    ? '每日一题: 暂无数据'
    : `每日一题: #${daily.frontendId} ${daily.localizedTitle ?? daily.title} · 点击查看`
}
</script>

<template>
  <TBox
    :x="0"
    :y="0"
    :w="width"
    :h="4"
    border
    :title="`le-e · LeetCode ${state.cliVersion ?? '…'} · ${LANGUAGES.find(({ value }) => value === state.language)?.label ?? state.language} [g 切换语言] · ${state.viewMode === 'all' ? '题库' : state.viewMode === 'official' ? '官方题单' : '我的收藏'}`"
    :padding="0"
    :style="focused ? THEME.borderActive : THEME.border"
    :title-style="THEME.title"
  >
    <TText
      :x="1"
      :y="0"
      :w="Math.max(1, width - 2)"
      :value="`${focused ? '>' : ' '} 搜索 [/]: ${searchMode ? `${searchDraft}▏  Enter 确认 · Esc 取消` : state.filters.query || '题号 / 题目名'}   难度: ${state.filters.difficulty}   收藏夹: ${favoriteFolderName()}   状态: ${statusText()}`"
    />
    <TView
      :x="1"
      :y="1"
      :w="Math.max(1, width - 2)"
      :h="1"
      @click="dailyClickable && emit('openDaily')"
    >
      <TText
        :x="0"
        :y="0"
        :w="Math.max(1, width - 2)"
        :value="clip(dailyProblemText(), Math.max(1, width - 2))"
        :style="dailyClickable ? THEME.title : state.dailyError ? THEME.warning : THEME.muted"
      />
    </TView>
  </TBox>
</template>
