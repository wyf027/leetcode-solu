<script setup lang="ts">
import { TText } from '@simon_he/vue-tui'
import { computed, onUnmounted, reactive } from 'vue'

import type { AppController } from './application/createAppController'
import { editorGutterColumns } from './application/codePresentation'
import { createKeyRouter } from './application/keyRouter'
import type { UiInteractionState } from './application/keyRouter'
import type { TerminalInputBus } from './application/terminalInput'
import CodeEditor from './components/CodeEditor.vue'
import HeaderBar from './components/HeaderBar.vue'
import HelpOverlay from './components/HelpOverlay.vue'
import LogPanel from './components/LogPanel.vue'
import ProblemDetail from './components/ProblemDetail.vue'
import ProblemList from './components/ProblemList.vue'
import ResizeNotice from './components/ResizeNotice.vue'
import SubmitDialog from './components/SubmitDialog.vue'
import UnsavedDialog from './components/UnsavedDialog.vue'
import { RUNTIME_CONFIG } from './config/runtime'
import { THEME } from './styles/theme'

export interface ScreenSize {
  cols: number
  rows: number
}

const props = defineProps<{
  controller: AppController
  screen: ScreenSize
  inputBus: TerminalInputBus
  requestExit: () => void
}>()

const ui = reactive<UiInteractionState>({
  focus: 'problems',
  searchMode: false,
  searchDraft: '',
  searchOriginal: '',
  helpOpen: false,
  detailScroll: 0,
  logScroll: 0,
})

const tooSmall = computed(
  () =>
    props.screen.cols < RUNTIME_CONFIG.minimumColumns ||
    props.screen.rows < RUNTIME_CONFIG.minimumRows,
)
const visibleProblems = computed(() => props.controller.visibleProblems())
const selectedProblem = computed(
  () =>
    visibleProblems.value.find(({ id }) => id === props.controller.state.selectedProblemId) ?? null,
)
const selectedDetail = computed(() => {
  const id = props.controller.state.selectedProblemId
  return id === null ? null : (props.controller.state.details.get(id) ?? null)
})
const sourceReady = computed(() => {
  const id = props.controller.state.selectedProblemId
  return id !== null && props.controller.state.sourceReadyIds.has(id)
})
const testStatus = computed(() => {
  const id = props.controller.state.selectedProblemId
  return id === null ? 'not-run' : (props.controller.state.testStatuses.get(id) ?? 'not-run')
})
const testResult = computed(() => {
  const id = props.controller.state.selectedProblemId
  return id === null ? null : (props.controller.state.testResults.get(id) ?? null)
})
const submissionStatus = computed(() => {
  const id = props.controller.state.selectedProblemId
  return id === null ? 'idle' : (props.controller.state.submissionStatuses.get(id) ?? 'idle')
})
const selectedFavoriteFolder = computed(
  () =>
    props.controller.state.favoriteFolders.find(
      ({ slug }) => slug === props.controller.state.selectedFavoriteFolderSlug,
    ) ?? null,
)
const problemListTitle = computed(() =>
  props.controller.state.viewMode === 'all'
    ? '题库'
    : `我的收藏 · ${selectedFavoriteFolder.value?.name ?? '无收藏夹'}`,
)
const favoriteInSelectedFolder = computed(() => {
  const problem = selectedProblem.value
  const folder = selectedFavoriteFolder.value
  if (problem === null || folder === null) return false
  return folder.questions.some(
    (question) =>
      (problem.slug !== undefined && question.slug === problem.slug) ||
      question.title.normalize('NFKC').trim().toLocaleLowerCase() ===
        problem.title.normalize('NFKC').trim().toLocaleLowerCase(),
  )
})
const unsavedIntent = computed(() => {
  const editor = props.controller.state.editor
  return editor.phase === 'editing' && editor.buffer?.dirty ? editor.pendingCloseIntent : null
})

const headerHeight = 4
const footerHeight = 2
const logHeight = computed(() => (props.controller.state.logExpanded ? 8 : 3))
const middleHeight = computed(() =>
  Math.max(8, props.screen.rows - headerHeight - footerHeight - logHeight.value),
)
const listWidth = computed(() => Math.floor(props.screen.cols * 0.42))
const detailWidth = computed(() => props.screen.cols - listWidth.value)
const logY = computed(() => headerHeight + middleHeight.value)
const footerY = computed(() => props.screen.rows - footerHeight)

const handleInput = createKeyRouter({
  controller: props.controller,
  ui,
  requestExit: props.requestExit,
  editorViewport: () => ({
    rows: Math.max(1, props.screen.rows - 4),
    columns: Math.max(
      1,
      props.screen.cols -
        2 -
        editorGutterColumns(props.controller.state.editor.buffer?.lines.length ?? 1),
    ),
  }),
})

const removeInputHandler = props.inputBus.setHandler(handleInput)
onUnmounted(removeInputHandler)
</script>

<template>
  <ResizeNotice v-if="tooSmall" :cols="screen.cols" :rows="screen.rows" />

  <template v-else-if="controller.state.editor.phase !== 'idle'">
    <CodeEditor :editor="controller.state.editor" :cols="screen.cols" :rows="screen.rows" />
    <UnsavedDialog
      v-if="unsavedIntent"
      :cols="screen.cols"
      :rows="screen.rows"
      :intent="unsavedIntent"
    />
  </template>

  <template v-else>
    <HeaderBar
      :state="controller.state"
      :width="screen.cols"
      :focused="ui.focus === 'filters'"
      :search-mode="ui.searchMode"
      :search-draft="ui.searchDraft"
    />
    <ProblemList
      :problems="visibleProblems"
      :selected-id="controller.state.selectedProblemId"
      :x="0"
      :y="headerHeight"
      :width="listWidth"
      :height="middleHeight"
      :focused="ui.focus === 'problems'"
      :title="problemListTitle"
    />
    <ProblemDetail
      :problem="selectedProblem"
      :detail="selectedDetail"
      :x="listWidth"
      :y="headerHeight"
      :width="detailWidth"
      :height="middleHeight"
      :focused="ui.focus === 'detail'"
      :scroll="ui.detailScroll"
      :source-ready="sourceReady"
      :test-status="testStatus"
      :test-result="testResult"
      :submission-status="submissionStatus"
      :favorite-active="favoriteInSelectedFolder"
      :favorite-writable="selectedFavoriteFolder?.writable ?? false"
      :favorite-folder-name="selectedFavoriteFolder?.name ?? '无收藏夹'"
      @toggle-favorite="void controller.toggleFavoriteSelected()"
    />
    <LogPanel
      :logs="controller.state.logs"
      :x="0"
      :y="logY"
      :width="screen.cols"
      :height="logHeight"
      :focused="ui.focus === 'log'"
      :scroll="ui.logScroll"
    />
    <TText
      :x="1"
      :y="footerY"
      :w="Math.max(1, screen.cols - 2)"
      :value="
        controller.state.lastError
          ? `${controller.state.lastError.code}: ${controller.state.lastError.message}`
          : '↑↓/jk 移动 · Enter 详情 · e 内置编辑 · E Vim · t 测试 · s 提交 · ? 帮助'
      "
      :style="controller.state.lastError ? THEME.error : THEME.muted"
    />
    <TText
      :x="1"
      :y="footerY + 1"
      :w="Math.max(1, screen.cols - 2)"
      value="a 收藏/取消 · v 题库/收藏页 · [ ] 切换收藏夹 · f 收藏筛选 · d 难度 · l 日志 · r 刷新 · q 退出"
      :style="THEME.muted"
    />
    <HelpOverlay v-if="ui.helpOpen" :cols="screen.cols" :rows="screen.rows" />
    <SubmitDialog
      v-if="controller.state.submitDialog.open"
      :cols="screen.cols"
      :rows="screen.rows"
      :problem="selectedProblem"
      :test-status="testStatus"
    />
  </template>
</template>
