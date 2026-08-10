<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'

import type { AppControllerState } from '../application/createAppController'
import { THEME } from '../styles/theme'

const props = defineProps<{
  state: AppControllerState
  width: number
  focused: boolean
  searchMode: boolean
  searchDraft: string
}>()

const statusText = (): string => {
  if (props.state.activeOperation !== null) return `Running ${props.state.activeOperation}`
  if (props.state.phase === 'error') return 'Error'
  if (props.state.stale) return 'Ready · stale data'
  return props.state.phase === 'ready' ? 'Ready' : 'Starting'
}

const favoriteFolderName = (): string =>
  props.state.favoriteFolders.find(({ slug }) => slug === props.state.selectedFavoriteFolderSlug)
    ?.name ?? '无'
</script>

<template>
  <TBox
    :x="0"
    :y="0"
    :w="width"
    :h="4"
    border
    :title="`le-e · LeetCode ${state.cliVersion ?? '…'} · JavaScript · ${state.viewMode === 'all' ? '题库' : '我的收藏'}`"
    :padding="0"
    :style="focused ? THEME.borderActive : THEME.border"
    :title-style="THEME.title"
  >
    <TText
      :x="1"
      :y="1"
      :w="Math.max(1, width - 2)"
      :value="`${focused ? '>' : ' '} 搜索: ${searchMode ? `${searchDraft}▏` : state.filters.query || '—'}   难度: ${state.filters.difficulty}   收藏夹: ${favoriteFolderName()}   状态: ${statusText()}`"
    />
  </TBox>
</template>
