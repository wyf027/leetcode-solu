<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'

import { THEME } from '../styles/theme'

defineProps<{ cols: number; rows: number }>()

const helpLines = [
  '↑↓ / j k   移动或滚动              Enter   加载详情',
  '/           搜索                      f       仅看收藏',
  'v           题库 / 我的收藏          [ ]     切换收藏夹',
  'a           收藏/取消当前题          d       切换难度',
  'e           使用本机 Vim 编辑           t       运行 CLI 测试',
  's           提交确认                    l       折叠/展开日志',
  'r           刷新                        q       退出',
  '',
  'Vim: :wq 保存并返回 TUI · :q! 放弃修改并返回 TUI',
  '',
  '按 ? 或 Esc 关闭帮助。',
]
</script>

<template>
  <TBox
    :x="Math.floor(cols * 0.12)"
    :y="4"
    :w="Math.floor(cols * 0.76)"
    :h="Math.min(19, rows - 8)"
    :z-index="20"
    border
    title="le-e 帮助"
    :padding="1"
    :style="THEME.overlay"
    :title-style="THEME.title"
  >
    <TText
      v-for="(line, index) in helpLines"
      :key="index"
      :x="1"
      :y="index + 1"
      :w="Math.max(1, Math.floor(cols * 0.76) - 4)"
      :value="line"
    />
  </TBox>
</template>
