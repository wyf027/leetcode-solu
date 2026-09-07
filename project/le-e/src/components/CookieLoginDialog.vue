<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'
import { computed } from 'vue'

import { THEME } from '../styles/theme'
import { cookieTokenFieldTitle, maskTokenInput } from './cookieLoginDisplay'

const props = defineProps<{
  cols: number
  rows: number
  sessionLength: number
  csrfLength: number
  activeField: 'session' | 'csrf'
  submitting: boolean
  error: string | null
}>()

const width = computed(() => Math.max(64, Math.min(props.cols - 4, Math.floor(props.cols * 0.72))))
const sessionMask = computed(() => maskTokenInput(props.sessionLength, width.value - 8))
const csrfMask = computed(() => maskTokenInput(props.csrfLength, width.value - 8))
</script>

<template>
  <TBox
    :x="Math.floor((cols - width) / 2)"
    :y="Math.max(2, Math.floor((rows - 16) / 2))"
    :w="width"
    :h="16"
    :z-index="40"
    border
    title="Token 登录 · 仅当前会话"
    :padding="1"
    :style="THEME.overlay"
    :title-style="THEME.title"
  >
    <TText :x="1" :y="0" value="分别粘贴两个 Token；内容只保存在当前 TUI 内存中。" />
    <TBox
      :x="1"
      :y="2"
      :w="Math.max(1, width - 4)"
      :h="3"
      border
      :padding="0"
      :title="cookieTokenFieldTitle('LEETCODE_SESSION', activeField === 'session')"
      :style="activeField === 'session' ? THEME.borderActive : THEME.border"
    >
      <TText :x="1" :y="0" :w="Math.max(1, width - 8)" :value="sessionMask" />
    </TBox>
    <TBox
      :x="1"
      :y="6"
      :w="Math.max(1, width - 4)"
      :h="3"
      border
      :padding="0"
      :title="cookieTokenFieldTitle('csrftoken', activeField === 'csrf')"
      :style="activeField === 'csrf' ? THEME.borderActive : THEME.border"
    >
      <TText :x="1" :y="0" :w="Math.max(1, width - 8)" :value="csrfMask" />
    </TBox>
    <TText
      :x="1"
      :y="10"
      :w="Math.max(1, width - 4)"
      :value="submitting ? '◐ 正在验证 Token 并刷新题库…' : (error ?? '')"
      :style="error ? THEME.error : THEME.warning"
    />
    <TText
      :x="1"
      :y="11"
      value="Tab/Shift+Tab 切换 · Enter 下一项/登录 · Esc 取消并清除"
      :style="THEME.warning"
    />
  </TBox>
</template>
