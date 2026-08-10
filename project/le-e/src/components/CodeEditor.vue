<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'
import { computed } from 'vue'

import {
  codeCursorCell,
  ensureCodeCursorVisible,
  sliceCodeLineByCells,
} from '../application/codeBuffer'
import {
  cursorCharacter,
  editorGutterColumns,
  highlightJavaScriptLines,
  visibleHighlightSegments,
  visibleIndentGuideSegments,
} from '../application/codePresentation'
import type { EditorSessionState } from '../application/editorSession'
import { THEME } from '../styles/theme'

const props = defineProps<{ editor: EditorSessionState; cols: number; rows: number }>()

const viewportRows = computed(() => Math.max(1, props.rows - 4))
const gutterColumns = computed(() => editorGutterColumns(props.editor.buffer?.lines.length ?? 1))
const viewportColumns = computed(() => Math.max(1, props.cols - 2 - gutterColumns.value))

const visibleRows = computed(() => {
  const buffer = props.editor.buffer
  if (buffer === null) return []
  ensureCodeCursorVisible(buffer, viewportRows.value, viewportColumns.value)
  const visibleEnd = Math.min(buffer.lines.length, buffer.scrollRow + viewportRows.value)
  const highlightedLines = highlightJavaScriptLines(buffer.lines.slice(0, visibleEnd))
  return Array.from({ length: viewportRows.value }, (_, index) => {
    const row = buffer.scrollRow + index
    const line = buffer.lines[row] ?? ''
    const exists = row < buffer.lines.length
    const cursorCell = codeCursorCell(buffer) - buffer.scrollColumn
    return {
      row,
      exists,
      lineNumber: exists
        ? `${String(row + 1).padStart(gutterColumns.value - 3)} │ `
        : ' '.repeat(gutterColumns.value),
      text: sliceCodeLineByCells(line, buffer.scrollColumn, viewportColumns.value),
      indentSegments: visibleIndentGuideSegments(line, buffer.scrollColumn, viewportColumns.value),
      syntaxSegments: visibleHighlightSegments(
        line,
        highlightedLines[row] ?? [],
        buffer.scrollColumn,
        viewportColumns.value,
      ),
      cursor:
        row === buffer.cursorRow && cursorCell >= 0 && cursorCell < viewportColumns.value
          ? { x: cursorCell, ...cursorCharacter(line, buffer.cursorColumn) }
          : null,
    }
  })
})

const title = computed(() => {
  const editor = props.editor
  const status = editor.buffer?.dirty ? '已修改' : '已保存'
  const file = editor.document?.fileName ?? '等待 CLI…'
  return `#${editor.problemId ?? '…'} ${editor.problemTitle ?? ''} · JavaScript · ${file} · ${status}`
})
</script>

<template>
  <TBox
    :x="0"
    :y="0"
    :w="cols"
    :h="rows - 2"
    border
    :title="title"
    :padding="0"
    :style="THEME.borderActive"
    :title-style="THEME.title"
  >
    <TText
      v-if="editor.phase === 'launching'"
      :x="1"
      :y="1"
      value="正在通过 LeetCode CLI 准备 JavaScript 源码…"
      :style="THEME.warning"
    />
    <template v-else>
      <template v-for="line in visibleRows" :key="line.row">
        <TText
          :x="1"
          :y="line.row - (editor.buffer?.scrollRow ?? 0) + 1"
          :w="gutterColumns"
          :value="line.lineNumber"
          :style="
            line.row === editor.buffer?.cursorRow
              ? THEME.editorLineNumberActive
              : THEME.editorLineNumber
          "
        />
        <TText
          :x="1 + gutterColumns"
          :y="line.row - (editor.buffer?.scrollRow ?? 0) + 1"
          :w="viewportColumns"
          :value="line.text"
        />
        <TText
          v-for="(segment, segmentIndex) in line.indentSegments"
          :key="`indent-${line.row}-${segmentIndex}`"
          :x="1 + gutterColumns + segment.x"
          :y="line.row - (editor.buffer?.scrollRow ?? 0) + 1"
          :w="segment.width"
          :value="segment.text"
          :style="THEME.syntax[segment.kind]"
          :clear="false"
          :z-index="2"
        />
        <TText
          v-for="(segment, segmentIndex) in line.syntaxSegments"
          :key="`syntax-${line.row}-${segmentIndex}`"
          :x="1 + gutterColumns + segment.x"
          :y="line.row - (editor.buffer?.scrollRow ?? 0) + 1"
          :w="segment.width"
          :value="segment.text"
          :style="THEME.syntax[segment.kind]"
          :clear="false"
          :z-index="2"
        />
        <TText
          v-if="line.cursor"
          :x="1 + gutterColumns + line.cursor.x"
          :y="line.row - (editor.buffer?.scrollRow ?? 0) + 1"
          :w="line.cursor.width"
          :value="line.cursor.text"
          :style="THEME.editorCursor"
          :clear="false"
          :z-index="3"
        />
      </template>
    </template>
  </TBox>
  <TText
    :x="1"
    :y="rows - 2"
    :w="Math.max(1, cols - 2)"
    value="Ctrl+S 保存 · Esc 返回 · Tab 缩进 2 空格 · Ctrl+C 退出"
    :style="THEME.muted"
  />
</template>
