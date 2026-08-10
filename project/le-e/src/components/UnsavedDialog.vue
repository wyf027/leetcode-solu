<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'

import type { EditorCloseIntent } from '../application/editorSession'
import { THEME } from '../styles/theme'

defineProps<{ cols: number; rows: number; intent: EditorCloseIntent }>()
</script>

<template>
  <TBox
    :x="Math.floor(cols * 0.2)"
    :y="Math.floor(rows * 0.35)"
    :w="Math.floor(cols * 0.6)"
    :h="8"
    :z-index="40"
    border
    title="未保存修改"
    :padding="1"
    :style="THEME.overlay"
    :title-style="THEME.warning"
  >
    <TText
      :x="1"
      :y="1"
      :w="Math.max(1, Math.floor(cols * 0.6) - 4)"
      :h="5"
      :value="`${intent === 'quit' ? '保存修改后退出 le-e？' : '保存修改后返回题目列表？'}\n\nEnter / s 保存 · d / y 放弃 · Esc / n 继续编辑`"
      :style="THEME.warning"
    />
  </TBox>
</template>
