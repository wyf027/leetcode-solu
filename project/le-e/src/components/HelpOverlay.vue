<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'

import { THEME } from '../styles/theme'

defineProps<{ cols: number; rows: number }>()

const helpLines = [
  'g           切换语言：JavaScript → Python 3 → Java → C++（切换后先按 e）',
  'F6 / Shift+F6 切换栏目（Micro 内 Tab 保留缩进/补全）',
  'b 收起/展开题目列表 · 拖动中线调整宽度 · 编辑器外 Ctrl+←→ 调整宽度',
  '↑↓ / j k   移动或滚动              Enter   打开文件夹 / 加载详情',
  '鼠标滚轮：按鼠标位置滚动列表 / 题干 / Micro / 日志（无需切换焦点）',
  'Shift+↑↓    跳 10 题                Ctrl+↑↓ 跳 100 题 · 首题 ↑ 回末题',
  '/           搜索                      f       仅看收藏',
  'v           题库 / 收藏页            Esc     返回收藏夹',
  '[ ]         切换收藏夹              Backspace 返回收藏夹',
  'a           收藏/取消当前题          d       切换难度',
  'c           Token 登录（仅当前会话）',
  'e           打开 Micro 编辑             t       运行 CLI 测试',
  's           提交确认                    l       折叠/展开日志',
  'r           刷新                        q       退出',
  '',
  'F2 保存 · F3 保存并执行 · F4 保存并提交确认（也可点击底部按钮）',
  'Micro: Ctrl+S 保存 · Ctrl+Q 退出 · 执行/提交前自动保存并结束编辑',
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
