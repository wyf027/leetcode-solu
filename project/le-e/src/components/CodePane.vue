<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'
import type { Style } from '@simon_he/vue-tui'
import { computed, watch } from 'vue'

import type { EmbeddedMicro } from '../infrastructure/embeddedMicro'
import type { TerminalInputEvent } from '../application/terminalInput'
import { THEME } from '../styles/theme'

const props = defineProps<{
  editor: EmbeddedMicro
  x: number
  y: number
  width: number
  height: number
  focused: boolean
}>()
watch(
  () => [props.width, props.height],
  () => {
    props.editor.resize(props.width - 2, props.height - 2)
  },
  { immediate: true },
)

const palette = [
  '#000000',
  '#cd0000',
  '#00cd00',
  '#cdcd00',
  '#0000ee',
  '#cd00cd',
  '#00cdcd',
  '#e5e5e5',
  '#7f7f7f',
  '#ff0000',
  '#00ff00',
  '#ffff00',
  '#5c5cff',
  '#ff00ff',
  '#00ffff',
  '#ffffff',
]
const color = (value: number, rgb: boolean, fallback: string): string => {
  if (rgb) return `#${value.toString(16).padStart(6, '0')}`
  if (value < 16) return palette[value] ?? fallback
  if (value >= 232) {
    const gray = (8 + (value - 232) * 10).toString(16).padStart(2, '0')
    return `#${gray}${gray}${gray}`
  }
  const levels = [0, 95, 135, 175, 215, 255]
  const index = value - 16
  return `#${[Math.floor(index / 36), Math.floor(index / 6) % 6, index % 6]
    .map((n) => (levels[n] ?? 0).toString(16).padStart(2, '0'))
    .join('')}`
}
const runs = computed(() => {
  void props.editor.state.revision
  const terminal = props.editor.terminal
  const buffer = terminal.buffer.active
  const output: { x: number; y: number; text: string; width: number; style: Style }[] = []
  for (let y = 0; y < terminal.rows; y++) {
    const line = buffer.getLine(buffer.viewportY + y)
    let previous: (typeof output)[number] | undefined
    let previousStyle = ''
    for (let x = 0; x < terminal.cols; x++) {
      const cell = line?.getCell(x)
      if (!cell || cell.getWidth() === 0) continue
      const cursor =
        props.focused &&
        props.editor.state.active &&
        props.editor.state.cursorVisible &&
        x === buffer.cursorX &&
        buffer.baseY + buffer.cursorY === buffer.viewportY + y
      const style: Style = {
        fg: cell.isFgDefault()
          ? 'whiteBright'
          : color(cell.getFgColor(), cell.isFgRGB(), 'whiteBright'),
        bg: cell.isBgDefault() ? 'black' : color(cell.getBgColor(), cell.isBgRGB(), 'black'),
        bold: !!cell.isBold(),
        italic: !!cell.isItalic(),
        dim: !!cell.isDim(),
        underline: !!cell.isUnderline(),
        inverse: !!cell.isInverse() !== cursor,
      }
      const key = JSON.stringify(style)
      const text = cell.isInvisible() ? ' '.repeat(cell.getWidth()) : cell.getChars() || ' '
      if (previous && previousStyle === key) {
        previous.text += text
        previous.width += cell.getWidth()
      } else {
        previous = { x, y, text, width: cell.getWidth(), style }
        output.push(previous)
        previousStyle = key
      }
    }
  }
  return output
})
const popup = computed(() => {
  void props.editor.state.revision
  const state = props.editor.state,
    terminal = props.editor.terminal
  if (!props.focused || !state.active || state.saving || !state.completionItems.length) return null
  const count = Math.max(1, Math.min(6, state.completionItems.length, terminal.rows - 4))
  const w = Math.min(
    terminal.cols,
    Math.max(18, ...state.completionItems.map((word) => word.length + 4)),
  )
  const h = count + 2,
    cursor = terminal.buffer.active
  const x = Math.max(0, Math.min(terminal.cols - w, cursor.cursorX - state.completionPrefix.length))
  const y =
    cursor.cursorY + h + 1 <= terminal.rows - 2
      ? cursor.cursorY + 1
      : Math.max(0, cursor.cursorY - h)
  const start = Math.max(0, state.completionIndex - count + 1)
  return { x, y, w, h, start, items: state.completionItems.slice(start, start + count) }
})
defineExpose({
  handleCompletionPointer(event: TerminalInputEvent): boolean {
    const menu = popup.value
    if (!menu || !('cellX' in event)) return false
    const x = event.cellX - props.x - 1 - menu.x,
      y = event.cellY - props.y - 1 - menu.y
    if (x < 0 || x >= menu.w || y < 0 || y >= menu.h) return false
    if (event.type === 'wheel')
      props.editor.selectCompletion(props.editor.state.completionIndex + Math.sign(event.deltaY))
    else if (y > 0 && y < menu.h - 1) {
      const index = menu.start + y - 1
      if (event.type === 'pointermove' || event.type === 'pointerdown')
        props.editor.selectCompletion(index)
      if (event.type === 'click') props.editor.acceptCompletion(index)
    }
    return true
  },
})
</script>

<template>
  <TBox
    :x="x"
    :y="y"
    :w="width"
    :h="height"
    border
    :padding="0"
    :title="`${focused ? '> ' : ''}Micro · ${editor.state.active ? 'Ctrl+S 保存 · Ctrl+Q 退出 · F6 切栏' : '按 e 编辑'}`"
    :style="focused ? THEME.borderActive : THEME.border"
  >
    <template v-if="editor.state.active">
      <TText
        v-for="(run, index) in runs"
        :key="index"
        :x="run.x"
        :y="run.y"
        :w="run.width"
        :h="1"
        :value="run.text"
        :style="run.style"
        :wrap="false"
      />
    </template>
    <TText
      v-else
      :x="1"
      :y="1"
      :w="Math.max(1, width - 3)"
      :value="'按 e 打开 Micro，直接输入代码。\nCtrl+S 保存 · Ctrl+Q 退出\n底部按钮可保存、执行和提交。'"
      :style="THEME.muted"
    />
    <TBox
      v-if="popup"
      :x="popup.x"
      :y="popup.y"
      :w="popup.w"
      :h="popup.h"
      :z-index="20"
      border
      :padding="0"
      :style="{ fg: 'gray', bg: '#202630' }"
    >
      <TText
        v-for="(word, index) in popup.items"
        :key="word"
        :x="0"
        :y="index"
        :w="popup.w - 2"
        :h="1"
        :value="
          `${popup.start + index === editor.state.completionIndex ? '›' : ' '} ${word}`.padEnd(
            popup.w - 2,
          )
        "
        :style="
          popup.start + index === editor.state.completionIndex
            ? THEME.selected
            : { fg: 'whiteBright', bg: '#202630' }
        "
      />
    </TBox>
  </TBox>
</template>
