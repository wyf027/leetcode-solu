<script setup lang="ts">
import { TBox, TText, TView } from '@simon_he/vue-tui'
import { detectTerminalGraphicsCapabilities } from '@simon_he/vue-tui/cli'
import { env as processEnvironment } from 'node:process'
import {
  TVirtualMarkdown,
  buildMarkdownBlocks,
  createTuiMarkdownParser,
} from '@simon_he/vue-tui/markdown'
import type {
  TuiMarkdownBlock,
  TuiMarkdownGraphicSegment,
  TuiMarkdownInlineSegment,
  TuiMarkdownTableCell,
} from '@simon_he/vue-tui/markdown'
import { computed, shallowRef, ref, watch, onUnmounted } from 'vue'

import type { ParsedTestResult } from '../domain/operation'
import type { ProblemDetail as ProblemDetailModel, ProblemSummary } from '../domain/problem'
import { THEME } from '../styles/theme'
import { renderTerminalImageBlocks } from '../infrastructure/terminalImageBlocks'

const props = defineProps<{
  problem: ProblemSummary | null
  detail: ProblemDetailModel | null
  x: number
  y: number
  width: number
  height: number
  focused: boolean
  scroll: number
  sourceReady: boolean
  testStatus: string
  testResult: ParsedTestResult | null
  submissionStatus: string
  favoriteActive: boolean
  favoriteWritable: boolean
  favoriteFolderName: string
  loading: boolean
}>()

const emit = defineEmits<{ toggleFavorite: []; updateScroll: [value: number] }>()

const markdownParser = createTuiMarkdownParser()
const TERMINAL_CELL_WIDTH_PX = 8
const TERMINAL_CELL_HEIGHT_PX = 16
const IMAGE_SIZE_PATTERN = /\uE002(?<width>\d+)x(?<height>\d+)\uE003/

const withoutImageSize = (value: string): string => value.replace(IMAGE_SIZE_PATTERN, '')

const fitImageToOriginalSize = (
  graphic: TuiMarkdownGraphicSegment,
  maximumWidth: number,
): TuiMarkdownGraphicSegment => {
  if (
    graphic.kind !== 'image' ||
    graphic.naturalWidth === undefined ||
    graphic.naturalHeight === undefined
  ) {
    return graphic
  }
  const encodedSize = IMAGE_SIZE_PATTERN.exec(graphic.alt ?? '')
  const originalPixelsWidth = Number(encodedSize?.groups?.width) || graphic.naturalWidth
  const originalPixelsHeight = Number(encodedSize?.groups?.height) || graphic.naturalHeight
  const originalWidth = Math.max(1, Math.ceil(originalPixelsWidth / TERMINAL_CELL_WIDTH_PX))
  const originalHeight = Math.max(1, Math.ceil(originalPixelsHeight / TERMINAL_CELL_HEIGHT_PX))
  const scale = Math.min(1, maximumWidth / originalWidth)
  return {
    ...graphic,
    ...(graphic.alt === undefined ? {} : { alt: withoutImageSize(graphic.alt) }),
    displayWidth: Math.max(1, Math.floor(originalWidth * scale)),
    displayHeight: Math.max(1, Math.round(originalHeight * scale)),
  }
}

const resizeSegments = (
  segments: readonly TuiMarkdownInlineSegment[],
  maximumWidth: number,
): readonly TuiMarkdownInlineSegment[] =>
  segments.map((segment) => {
    const text = withoutImageSize(segment.text)
    return segment.graphic === undefined
      ? text === segment.text
        ? segment
        : { ...segment, text }
      : {
          ...segment,
          text,
          graphic: fitImageToOriginalSize(segment.graphic, maximumWidth),
        }
  })

const resizeCell = (cell: TuiMarkdownTableCell, maximumWidth: number): TuiMarkdownTableCell => ({
  ...cell,
  segments: resizeSegments(cell.segments, maximumWidth),
})

const resizeBlockImages = (block: TuiMarkdownBlock, maximumWidth: number): TuiMarkdownBlock => {
  if (block.type === 'inline') {
    return { ...block, segments: resizeSegments(block.segments, maximumWidth) }
  }
  if (block.type === 'table') {
    return {
      ...block,
      header: block.header.map((cell) => resizeCell(cell, maximumWidth)),
      rows: block.rows.map((row) => row.map((cell) => resizeCell(cell, maximumWidth))),
    }
  }
  return block
}

const heading = computed(() => {
  if (props.loading) return '◐ 加载题目和图片中…'
  if (props.problem === null) return 'Select a problem.'
  const source = props.sourceReady ? 'source ready' : 'press e to prepare source'
  const title = props.detail?.localizedTitle ?? props.problem.localizedTitle ?? props.problem.title
  return `[${props.problem.id}] ${title} · ${props.problem.difficulty} · ${source}`
})

const statement = computed(() => {
  if (props.loading) return '正在获取题面并准备终端图片画布。'
  if (props.problem === null) return 'Use ↑/↓ or j/k to select a problem.'
  if (props.detail === null) return 'Press Enter to load the problem statement.'
  return props.detail.statement || 'The CLI returned an empty problem statement.'
})

const failedCase = computed(() => {
  const result = props.testResult
  if (result?.outcome !== 'failed') return ''
  const lines = [`── 未通过的用例 ──`, `结果: ${result.message}`]
  if (result.failedCase?.input !== undefined) lines.push(`输入: ${result.failedCase.input}`)
  if (result.failedCase?.actual !== undefined) lines.push(`实际输出: ${result.failedCase.actual}`)
  if (result.failedCase?.expected !== undefined)
    lines.push(`期望输出: ${result.failedCase.expected}`)
  return lines.join('\n')
})

const content = computed(() =>
  failedCase.value === '' ? statement.value : `${failedCase.value}\n\n${statement.value}`,
)
const markdownWidth = computed(() => Math.max(1, props.width - 3))
const sourceBlocks = computed(() => {
  const maximumWidth = markdownWidth.value
  return buildMarkdownBlocks(content.value, markdownParser).blocks.map((block) =>
    resizeBlockImages(block, maximumWidth),
  )
})
const nativeImages = detectTerminalGraphicsCapabilities({
  env: processEnvironment,
  stdoutIsTTY: !!process.stdout.isTTY,
}).supported
const markdownBlocks = shallowRef<readonly TuiMarkdownBlock[]>([])
const documentRevision = ref(0)
let imageRenderVersion = 0
watch(
  sourceBlocks,
  async (blocks) => {
    const version = ++imageRenderVersion
    markdownBlocks.value = blocks.map((block) =>
      block.type === 'inline'
        ? {
            ...block,
            segments: block.segments.flatMap((segment) =>
              segment.graphic?.kind === 'image'
                ? [
                    { text: '正在准备图片…', style: THEME.muted },
                    ...Array.from(
                      {
                        length: Math.max(0, Math.min(256, segment.graphic.displayHeight ?? 1) - 1),
                      },
                      () => ({ text: '', hardBreak: true }),
                    ),
                  ]
                : [segment],
            ),
          }
        : block,
    )
    documentRevision.value++
    const rendered = await renderTerminalImageBlocks(blocks, nativeImages)
    if (version === imageRenderVersion) {
      markdownBlocks.value = rendered
      documentRevision.value++
    }
  },
  { immediate: true },
)
onUnmounted(() => {
  imageRenderVersion++
})

const favoriteLabel = computed(() => {
  if (!props.favoriteWritable) return `☆ ${props.favoriteFolderName} 为只读收藏夹`
  return props.favoriteActive
    ? `★ 已收藏到 ${props.favoriteFolderName} · 点击或按 a 取消`
    : `☆ 点击或按 a 收藏到 ${props.favoriteFolderName}`
})
</script>

<template>
  <TBox
    :x="x"
    :y="y"
    :w="width"
    :h="height"
    border
    :title="`${focused ? '> ' : ''}Detail · test ${testStatus} · submit ${submissionStatus}`"
    :padding="0"
    :style="focused ? THEME.borderActive : THEME.border"
  >
    <TText :x="1" :y="1" :w="Math.max(1, width - 2)" :value="heading" :style="THEME.title" />
    <TView
      :x="1"
      :y="2"
      :w="Math.max(1, width - 2)"
      :h="1"
      @click="favoriteWritable && emit('toggleFavorite')"
    >
      <TText
        :x="0"
        :y="0"
        :w="Math.max(1, width - 2)"
        :value="favoriteLabel"
        :style="favoriteActive ? THEME.warning : THEME.muted"
      />
    </TView>
    <!-- vue-tui detects controlled scrolling from the raw camel-case VNode prop names. -->
    <!-- eslint-disable vue/attribute-hyphenation, vue/v-on-event-hyphenation -->
    <TVirtualMarkdown
      :key="`${x}:${y}:${width}:${height}:${documentRevision}`"
      :x="1"
      :y="4"
      :w="markdownWidth"
      :h="Math.max(1, height - 6)"
      :content="content"
      :blocks="markdownBlocks"
      :scrollTop="scroll"
      :style="loading ? THEME.warning : THEME.normal"
      @update:scrollTop="emit('updateScroll', $event)"
    />
    <!-- eslint-enable vue/attribute-hyphenation, vue/v-on-event-hyphenation -->
  </TBox>
</template>
