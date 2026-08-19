<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'
import { computed, onUnmounted, reactive } from 'vue'

import type { AppController } from './application/createAppController'
import { createKeyRouter } from './application/keyRouter'
import type { UiInteractionState } from './application/keyRouter'
import type { TerminalInputBus } from './application/terminalInput'
import FavoriteFolderList from './components/FavoriteFolderList.vue'
import HeaderBar from './components/HeaderBar.vue'
import HelpOverlay from './components/HelpOverlay.vue'
import LogPanel from './components/LogPanel.vue'
import ProblemDetail from './components/ProblemDetail.vue'
import ProblemList from './components/ProblemList.vue'
import ResizeNotice from './components/ResizeNotice.vue'
import SubmitDialog from './components/SubmitDialog.vue'
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
    : `收藏夹 › ${selectedFavoriteFolder.value?.name ?? '无收藏夹'}`,
)
const showingFavoriteFolders = computed(
  () =>
    props.controller.state.viewMode === 'favorites' &&
    props.controller.state.favoritePage === 'folders',
)
const loadingCatalog = computed(
  () =>
    props.controller.state.phase === 'starting' ||
    ['preflight', 'refresh-list', 'refresh-starred'].includes(
      props.controller.state.activeOperation ?? '',
    ),
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
const loadingDetail = computed(() => props.controller.state.activeOperation === 'load-detail')

const openFavoriteFolder = (slug: string): void => {
  if (!props.controller.openFavoriteFolder(slug)) return
  ui.focus = 'problems'
  ui.detailScroll = 0
}

const handleInput = createKeyRouter({
  controller: props.controller,
  ui,
  requestExit: props.requestExit,
})

const removeInputHandler = props.inputBus.setHandler(handleInput)
onUnmounted(removeInputHandler)
</script>

<template>
  <ResizeNotice v-if="tooSmall" :cols="screen.cols" :rows="screen.rows" />

  <template v-else>
    <HeaderBar
      :state="controller.state"
      :width="screen.cols"
      :focused="ui.focus === 'filters'"
      :search-mode="ui.searchMode"
      :search-draft="ui.searchDraft"
    />
    <FavoriteFolderList
      v-if="showingFavoriteFolders"
      :folders="controller.state.favoriteFolders"
      :selected-slug="controller.state.selectedFavoriteFolderSlug"
      :x="0"
      :y="headerHeight"
      :width="listWidth"
      :height="middleHeight"
      :focused="ui.focus === 'problems'"
      :loading="loadingCatalog"
      @open="openFavoriteFolder"
    />
    <ProblemList
      v-else
      :problems="visibleProblems"
      :selected-id="controller.state.selectedProblemId"
      :x="0"
      :y="headerHeight"
      :width="listWidth"
      :height="middleHeight"
      :focused="ui.focus === 'problems'"
      :title="problemListTitle"
      :loading="loadingCatalog"
    />
    <TBox
      v-if="showingFavoriteFolders"
      :x="listWidth"
      :y="headerHeight"
      :w="detailWidth"
      :h="middleHeight"
      border
      title="收藏夹"
      :padding="0"
      :style="ui.focus === 'detail' ? THEME.borderActive : THEME.border"
    >
      <TText
        :x="1"
        :y="1"
        :w="Math.max(1, detailWidth - 2)"
        :value="selectedFavoriteFolder?.name ?? '选择一个收藏夹'"
        :style="THEME.title"
      />
      <TText
        :x="1"
        :y="3"
        :w="Math.max(1, detailWidth - 2)"
        :value="
          loadingCatalog
            ? '◐ 加载收藏夹中…'
            : selectedFavoriteFolder
              ? `${selectedFavoriteFolder.questions.length} 道题${selectedFavoriteFolder.writable ? '' : ' · 只读收藏夹'}\n\n按 Enter 或点击文件夹查看题目。`
              : '暂无可用收藏夹。'
        "
        :style="loadingCatalog ? THEME.warning : THEME.muted"
      />
    </TBox>
    <ProblemDetail
      v-else
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
      :loading="loadingDetail"
      @toggle-favorite="void controller.toggleFavoriteSelected()"
      @update-scroll="ui.detailScroll = $event"
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
          : showingFavoriteFolders
            ? '↑↓/jk 选择收藏夹 · Enter 打开 · 点击打开 · ? 帮助'
            : '↑↓/jk 移动 · Enter 详情 · Esc 返回收藏夹 · e Vim 编辑 · t 测试 · s 提交 · ? 帮助'
      "
      :style="controller.state.lastError ? THEME.error : THEME.muted"
    />
    <TText
      :x="1"
      :y="footerY + 1"
      :w="Math.max(1, screen.cols - 2)"
      value="a 收藏/取消 · v 题库/收藏页 · [ ] 切换收藏夹 · Esc/Backspace 返回 · f 收藏筛选 · d 难度 · l 日志 · r 刷新 · q 退出"
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
