<script setup lang="ts">
import { TBox, TText, TView } from '@simon_he/vue-tui'
import { computed, onUnmounted, reactive, ref, watch } from 'vue'

import type { AppController } from './application/createAppController'
import { createKeyRouter } from './application/keyRouter'
import type { UiInteractionState } from './application/keyRouter'
import type { TerminalInputBus } from './application/terminalInput'
import CookieLoginDialog from './components/CookieLoginDialog.vue'
import FavoriteFolderList from './components/FavoriteFolderList.vue'
import HeaderBar from './components/HeaderBar.vue'
import HelpOverlay from './components/HelpOverlay.vue'
import LogPanel from './components/LogPanel.vue'
import ProblemDetail from './components/ProblemDetail.vue'
import ProblemList from './components/ProblemList.vue'
import ResizeNotice from './components/ResizeNotice.vue'
import SubmitDialog from './components/SubmitDialog.vue'
import CodePane from './components/CodePane.vue'
import type { EmbeddedMicro } from './infrastructure/embeddedMicro'
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
  editor?: EmbeddedMicro
  setPointerShape?: (shape: 'default' | 'ew-resize' | 'ns-resize') => void
}>()

const ui = reactive<UiInteractionState>({
  focus: 'problems',
  searchMode: false,
  searchDraft: '',
  searchOriginal: '',
  cookieSessionDraft: '',
  cookieCsrfDraft: '',
  cookieField: 'session',
  helpOpen: false,
  detailScroll: 0,
  logScroll: 0,
})
const problemList = ref<InstanceType<typeof ProblemList> | null>(null)
const folderList = ref<InstanceType<typeof FavoriteFolderList> | null>(null)
const codePane = ref<InstanceType<typeof CodePane> | null>(null)

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
const submitProblem = computed(
  () =>
    props.controller.state.problems.find(
      ({ id }) => id === props.controller.state.submitDialog.problemId,
    ) ?? null,
)
const submitTestStatus = computed(
  () =>
    props.controller.state.testStatuses.get(props.controller.state.submitDialog.problemId ?? -1) ??
    'not-run',
)
const selectedDetail = computed(() => {
  const id = props.controller.state.selectedProblemId
  const detail = id === null ? undefined : props.controller.state.details.get(id)
  const problem = selectedProblem.value
  if (!detail || !problem) return null
  const matches =
    detail.slug !== undefined && problem.slug !== undefined
      ? detail.slug === problem.slug
      : detail.title.normalize('NFKC').trim().toLocaleLowerCase() ===
        problem.title.normalize('NFKC').trim().toLocaleLowerCase()
  return matches ? detail : null
})
const sourceReady = computed(() => {
  const id = props.controller.state.selectedProblemId
  return (
    id !== null &&
    selectedProblem.value?.identityStatus === 'resolved' &&
    props.controller.state.sourceReadyIds.has(id)
  )
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
const officialView = computed(() => props.controller.state.viewMode === 'official')
const collectionLabel = computed(() => (officialView.value ? '官方题单' : '收藏夹'))
const selectedOfficialPlan = computed(
  () =>
    props.controller.state.officialPlans.find(
      (p) => p.slug === props.controller.state.selectedOfficialPlanSlug,
    ) ?? null,
)
const selectedCollection = computed(() =>
  officialView.value
    ? (props.controller.state.officialPlans.find(
        (p) => p.slug === props.controller.state.selectedOfficialPlanSlug,
      ) ?? null)
    : selectedFavoriteFolder.value,
)
const collectionDescription = computed(() => {
  if (officialView.value) {
    if (props.controller.state.officialError) return props.controller.state.officialError
    const plan = props.controller.state.officialPlans.find(
      (p) => p.slug === props.controller.state.selectedOfficialPlanSlug,
    )
    return plan
      ? `${plan.questionCount} 道题 · 官方只读题单${plan.premium ? ' · 会员题单' : ''}\n\n${plan.description ?? ''}\n\n点击或 Enter 打开，/ 搜索题单，r 刷新。\n会员题可能需要权限；SQL/Shell 暂不支持 CLI 执行。`
      : '按 / 搜索官方题单，r 重试加载。'
  }
  const folder = selectedFavoriteFolder.value
  return folder
    ? `${folder.questions.length} 道题${folder.writable ? '' : ' · 只读收藏夹'}\n\n按 Enter 或点击文件夹查看题目。`
    : '暂无可用收藏夹。'
})
const problemListTitle = computed(() =>
  props.controller.state.viewMode === 'all'
    ? '题库'
    : `${collectionLabel.value} › ${selectedCollection.value?.name ?? ''}${officialView.value && selectedOfficialPlan.value && selectedOfficialPlan.value.questions.length < selectedOfficialPlan.value.questionCount ? ` · 公开 ${selectedOfficialPlan.value.questions.length}/${selectedOfficialPlan.value.questionCount}` : ''}`,
)
const showingFavoriteFolders = computed(
  () =>
    props.controller.state.viewMode !== 'all' && props.controller.state.favoritePage === 'folders',
)
const loadingCatalog = computed(
  () =>
    props.controller.state.phase === 'starting' ||
    ['preflight', 'refresh-list', 'refresh-starred', 'load-plans'].includes(
      props.controller.state.activeOperation ?? '',
    ),
)
const favoriteInSelectedFolder = computed(() => {
  const problem = selectedProblem.value
  const folder = selectedFavoriteFolder.value
  if (problem === null || folder === null) return false
  return folder.questions.some((question) =>
    problem.slug !== undefined
      ? question.slug === problem.slug
      : question.title.normalize('NFKC').trim().toLocaleLowerCase() ===
        problem.title.normalize('NFKC').trim().toLocaleLowerCase(),
  )
})
const headerHeight = 4
const footerHeight = 3
const listCollapsed = ref(false)
const splitRatio = ref(0.5)
const requestedListWidth = ref<number | null>(null)
const requestedLogHeight = ref<number | null>(null)
// Adjacent panes share their border cell, which is also the resize hit target.
const availableHeight = computed(() => props.screen.rows - headerHeight - footerHeight + 1)
const logHeight = computed(() =>
  props.controller.state.logExpanded
    ? Math.max(
        3,
        Math.min(
          requestedLogHeight.value ?? (testResult.value?.outcome === 'failed' ? 12 : 6),
          availableHeight.value - 8,
        ),
      )
    : 3,
)
const listWidth = computed(() =>
  listCollapsed.value
    ? 3
    : Math.max(
        24,
        Math.min(
          requestedListWidth.value ?? Math.floor(props.screen.cols * 0.25),
          props.screen.cols - 62,
        ),
      ),
)
const detailX = computed(() => listWidth.value - 1)
const detailAreaWidth = computed(() => props.screen.cols - detailX.value)
const workspaceY = computed(() => headerHeight)
const middleHeight = computed(() => availableHeight.value - logHeight.value)
const detailWidth = computed(() =>
  Math.max(
    30,
    Math.min(
      detailAreaWidth.value - 29,
      Math.floor((detailAreaWidth.value + 1) * splitRatio.value),
    ),
  ),
)
const editorX = computed(() => detailX.value + detailWidth.value - 1)
const editorWidth = computed(() => props.screen.cols - editorX.value)
const logY = computed(() => workspaceY.value + middleHeight.value - 1)
const footerY = computed(() => props.screen.rows - footerHeight)
const loadingDetail = computed(() => props.controller.state.activeOperation === 'load-detail')

const toggleList = () => {
  listCollapsed.value = !listCollapsed.value
  if (listCollapsed.value && ui.focus === 'problems') ui.focus = 'detail'
}
watch(
  () => props.editor?.state.active,
  (active) => {
    if (active) ui.focus = 'editor'
    else if (ui.focus === 'editor') ui.focus = 'detail'
  },
)

const openFavoriteFolder = (slug: string): void => {
  if (props.controller.state.activeOperation !== null || props.editor?.state.active) return
  if (officialView.value) {
    void props.controller.openOfficialPlan(slug)
    ui.focus = 'problems'
    ui.detailScroll = 0
    return
  }
  if (!props.controller.openFavoriteFolder(slug)) return
  ui.focus = 'problems'
  ui.detailScroll = 0
}
const showOfficialPlans = (): void => {
  if (props.controller.state.activeOperation !== null || props.editor?.state.active) return
  listCollapsed.value = false
  ui.focus = 'problems'
  ui.detailScroll = 0
  void props.controller.showOfficialPlans()
}

const selectProblem = (id: number): void => {
  if (props.controller.state.activeOperation !== null || props.editor?.state.active) return
  props.controller.selectProblem(id)
  ui.focus = 'problems'
  ui.detailScroll = 0
  void props.controller.loadSelectedDetail()
}

const openBreadcrumbRoot = (): void => {
  if (props.controller.state.activeOperation !== null || props.editor?.state.active) return
  props.controller.closeFavoriteFolder()
  ui.focus = 'problems'
  ui.detailScroll = 0
}

const handleInput = createKeyRouter({
  controller: props.controller,
  ui,
  requestExit: props.requestExit,
})

type Divider = 'width' | 'list' | 'log'
const actionBusy = ref(false)
const dragging = ref<Divider | false>(false)
const pointer = ref<{ x: number; y: number } | null>(null)
const hoveredDivider = computed<Divider | null>(() => {
  if (
    tooSmall.value ||
    ui.helpOpen ||
    ui.searchMode ||
    props.controller.state.cookieLogin.open ||
    props.controller.state.submitDialog.open ||
    actionBusy.value
  )
    return null
  if (dragging.value) return dragging.value
  const position = pointer.value
  if (!position || position.x < 0 || position.x >= props.screen.cols) return null
  if (
    !listCollapsed.value &&
    position.x === detailX.value &&
    position.y >= workspaceY.value &&
    position.y < logY.value
  )
    return 'list'
  if (position.y === logY.value) return 'log'
  if (position.x === editorX.value && position.y >= workspaceY.value && position.y < logY.value)
    return 'width'
  return null
})
watch(hoveredDivider, (divider) =>
  props.setPointerShape?.(
    divider === null ? 'default' : divider === 'log' ? 'ns-resize' : 'ew-resize',
  ),
)
onUnmounted(() => props.setPointerShape?.('default'))
let suppressDragClick = false
let microMouseDown = false
const actionMessage = ref('')
const editorAction = async (action: 'save' | 'test' | 'submit') => {
  if (actionBusy.value || props.controller.state.submitDialog.open) return
  if (['test', 'submit'].includes(props.controller.state.activeOperation ?? '')) return
  if (props.controller.state.activeOperation !== null && !props.editor?.state.active) return
  actionBusy.value = true
  actionMessage.value = '正在保存…'
  try {
    if (props.editor?.state.active) {
      if (!(await props.editor.save(false))) {
        actionMessage.value = props.editor.state.error
        return
      }
      if (!(await props.controller.confirmEditorSaved())) {
        actionMessage.value = '未能确认当前源码已保存，已取消操作。'
        return
      }
    } else if (action === 'save') {
      actionMessage.value = '请先按 e 打开代码编辑器。'
      return
    }
    if (action === 'save') actionMessage.value = '已保存。'
    else {
      actionMessage.value = ''
      if (!props.editor?.state.active) ui.focus = 'log'
      if (action === 'test') await props.controller.testSelected()
      else props.controller.openSubmitDialog()
    }
  } catch (error) {
    actionMessage.value = error instanceof Error ? error.message : '操作失败，请重试。'
  } finally {
    actionBusy.value = false
  }
}
const removeInputHandler = props.inputBus.setHandler((event) => {
  if (tooSmall.value) {
    dragging.value = false
    pointer.value = null
    microMouseDown = false
    return props.editor?.state.active || (event.type === 'keydown' && event.metaKey)
      ? true
      : handleInput(event)
  }
  const modal =
    ui.helpOpen ||
    ui.searchMode ||
    props.controller.state.cookieLogin.open ||
    props.controller.state.submitDialog.open
  // Keep Micro mounted, but freeze input while a judge request reads the saved file.
  if (
    props.editor?.state.active &&
    ['test', 'submit'].includes(props.controller.state.activeOperation ?? '') &&
    event.type !== 'wheel'
  )
    return true
  if (event.type === 'keydown' && event.metaKey) {
    if (modal) return handleInput(event)
    if (!modal && !actionBusy.value && ui.focus === 'editor' && props.editor?.state.active) {
      return props.editor.input(event)
    }
    return true
  }
  if (modal) {
    dragging.value = false
    pointer.value = null
    return handleInput(event)
  }
  if (event.type === 'click' && suppressDragClick) {
    suppressDragClick = false
    return true
  }
  if (event.type === 'pointerdown') suppressDragClick = false
  if ('cellX' in event) pointer.value = { x: event.cellX, y: event.cellY }
  if ('cellY' in event && event.cellY === footerY.value && !dragging.value && !microMouseDown) {
    if (event.type === 'click') {
      if (event.cellX >= 1 && event.cellX < 13) void editorAction('save')
      else if (event.cellX >= 15 && event.cellX < 27) void editorAction('test')
      else if (event.cellX >= 29 && event.cellX < 41) void editorAction('submit')
    }
    return true
  }
  if (event.type === 'keydown' && ['F2', 'F3', 'F4'].includes(event.key)) {
    void editorAction(event.key === 'F2' ? 'save' : event.key === 'F3' ? 'test' : 'submit')
    return true
  }
  if (actionBusy.value && event.type !== 'wheel') return true
  if (!dragging.value && codePane.value?.handleCompletionPointer(event)) return true
  if (event.type === 'wheel') {
    if (dragging.value || !Number.isFinite(event.deltaY) || event.deltaY === 0) return true
    const step = Math.sign(event.deltaY) * 3
    if (event.cellX < 0 || event.cellX >= props.screen.cols) return true
    if (event.cellY >= logY.value && event.cellY < footerY.value) {
      ui.logScroll = Math.max(
        0,
        ui.logScroll + (testResult.value?.outcome === 'failed' ? step : -step),
      )
    } else if (event.cellY >= workspaceY.value && event.cellY < logY.value) {
      if (!listCollapsed.value && event.cellX < detailX.value) {
        if (showingFavoriteFolders.value) folderList.value?.scrollBy(step)
        else problemList.value?.scrollBy(step)
      } else if (event.cellX > detailX.value && event.cellX < editorX.value) {
        ui.detailScroll = Math.max(0, ui.detailScroll + step)
      } else if (event.cellX > editorX.value) {
        props.editor?.mouse(event, editorX.value + 1, workspaceY.value + 1)
      }
    }
    return true
  }
  if ('cellX' in event) {
    if (event.type === 'pointerup') {
      const handled = dragging.value
      dragging.value = false
      if (handled) {
        suppressDragClick = true
        return true
      }
    }
    if (microMouseDown && (event.type === 'pointermove' || event.type === 'pointerup')) {
      props.editor?.mouse(event, editorX.value + 1, workspaceY.value + 1)
      if (event.type === 'pointerup') microMouseDown = false
      return true
    }
    if (
      event.type === 'pointerdown' &&
      event.cellX === editorX.value &&
      event.cellY >= workspaceY.value &&
      event.cellY < logY.value
    ) {
      dragging.value = 'width'
      return true
    }
    if (
      event.type === 'pointerdown' &&
      !listCollapsed.value &&
      event.cellX === detailX.value &&
      event.cellY >= workspaceY.value &&
      event.cellY < logY.value
    ) {
      dragging.value = 'list'
      return true
    }
    if (event.type === 'pointerdown' && event.cellY === logY.value) {
      dragging.value = 'log'
      return true
    }
    if (event.type === 'pointermove' && dragging.value) {
      if (dragging.value === 'width') {
        splitRatio.value =
          Math.max(30, Math.min(detailAreaWidth.value - 29, event.cellX - detailX.value + 1)) /
          (detailAreaWidth.value + 1)
      } else if (dragging.value === 'list') {
        requestedListWidth.value = Math.max(24, Math.min(props.screen.cols - 62, event.cellX + 1))
      } else {
        if (!props.controller.state.logExpanded) props.controller.toggleLog()
        requestedLogHeight.value = Math.max(
          3,
          Math.min(footerY.value - event.cellY, availableHeight.value - 8),
        )
      }
      return true
    }
    if (event.type === 'click' || event.type === 'pointerdown') {
      if (event.cellY === headerHeight && event.cellX >= 0 && event.cellX < 4) {
        if (event.type === 'click') toggleList()
        return true
      }
      if (event.cellY >= workspaceY.value && event.cellY < logY.value)
        ui.focus =
          event.cellX >= editorX.value
            ? 'editor'
            : !listCollapsed.value && event.cellX < detailX.value
              ? 'problems'
              : 'detail'
      else if (event.cellY >= logY.value) ui.focus = 'log'
    }
    if (
      event.cellX > editorX.value &&
      event.cellX < props.screen.cols - 1 &&
      event.cellY > workspaceY.value &&
      event.cellY < logY.value &&
      props.editor?.state.active
    ) {
      if (props.editor.mouse(event, editorX.value + 1, workspaceY.value + 1)) {
        if (event.type === 'pointerdown') microMouseDown = true
        return true
      }
    }
  }
  if (event.type === 'keydown') {
    if (event.key === 'F6' || (event.key === 'Tab' && ui.focus !== 'editor')) {
      const order = props.editor?.state.active
        ? (['detail', 'editor', 'log'] as const)
        : listCollapsed.value
          ? (['detail', 'editor', 'log'] as const)
          : (['problems', 'detail', 'editor', 'log'] as const)
      const current = order.findIndex((pane) => pane === ui.focus)
      ui.focus =
        order[(current + (event.shiftKey ? order.length - 1 : 1)) % order.length] ?? 'detail'
      return true
    }
    if (ui.focus !== 'editor' && event.key === 'b') {
      toggleList()
      return true
    }
    if (
      ui.focus !== 'editor' &&
      event.ctrlKey &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      splitRatio.value = Math.max(
        0.3,
        Math.min(0.7, splitRatio.value + (event.key === 'ArrowLeft' ? -0.05 : 0.05)),
      )
      return true
    }
  }
  if (ui.focus === 'editor' && props.editor?.state.active) return props.editor.input(event)
  if (
    event.type === 'keydown' &&
    event.key === 'e' &&
    props.controller.state.activeOperation === null
  ) {
    actionMessage.value = ''
    void props.controller.editSelected()
    return true
  }
  if (
    ui.focus !== 'editor' &&
    event.type === 'keydown' &&
    (event.key === 't' || event.key === 's')
  ) {
    void editorAction(event.key === 't' ? 'test' : 'submit')
    return true
  }
  if (props.controller.state.activeOperation === 'edit') {
    if (
      event.type === 'keydown' &&
      ['ArrowUp', 'ArrowDown', 'j', 'k'].includes(event.key) &&
      ui.focus !== 'problems'
    )
      return handleInput(event)
    return true
  }
  if (ui.focus === 'editor') {
    if (event.type === 'keydown' && event.key === 'Tab') {
      ui.focus = 'log'
      return true
    }
    if (event.type === 'keydown' && ['ArrowUp', 'ArrowDown', 'j', 'k'].includes(event.key))
      return true
  }
  return handleInput(event)
})
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
    <TView :x="screen.cols - 18" :y="0" :w="16" :h="1" @click="showOfficialPlans">
      <TText :x="0" :y="0" :w="16" value="官方题单 [o]" :style="THEME.title" />
    </TView>
    <FavoriteFolderList
      v-if="showingFavoriteFolders && !listCollapsed"
      ref="folderList"
      :folders="officialView ? controller.visibleOfficialPlans() : controller.state.favoriteFolders"
      :selected-slug="
        officialView
          ? controller.state.selectedOfficialPlanSlug
          : controller.state.selectedFavoriteFolderSlug
      "
      :label="collectionLabel"
      :error="officialView ? controller.state.officialError : null"
      :x="0"
      :y="headerHeight + 1"
      :width="listWidth"
      :height="middleHeight - 1"
      :focused="ui.focus === 'problems'"
      :loading="loadingCatalog"
      @open="openFavoriteFolder"
    />
    <ProblemList
      v-else-if="!listCollapsed"
      ref="problemList"
      :problems="visibleProblems"
      :selected-id="controller.state.selectedProblemId"
      :x="0"
      :y="headerHeight + 1"
      :width="listWidth"
      :height="middleHeight - 1"
      :focused="ui.focus === 'problems'"
      :title="`${problemListTitle} · b 收起`"
      :loading="loadingCatalog"
      @select="selectProblem"
    />
    <TText
      :x="1"
      :y="headerHeight"
      :w="listCollapsed ? 1 : 2"
      :z-index="2"
      :value="listCollapsed ? '▶' : '◀'"
      :style="THEME.title"
    />
    <TView
      v-if="!listCollapsed"
      :x="4"
      :y="headerHeight"
      :w="8"
      :h="1"
      @click="openBreadcrumbRoot"
    >
      <TText
        :x="0"
        :y="0"
        :w="8"
        :value="controller.state.viewMode === 'all' ? '题库' : collectionLabel"
        :style="THEME.title"
      />
    </TView>
    <template
      v-if="!listCollapsed && controller.state.viewMode !== 'all' && !showingFavoriteFolders"
    >
      <TText :x="13" :y="headerHeight" value="›" :style="THEME.muted" />
      <TView
        :x="15"
        :y="headerHeight"
        :w="Math.max(1, listWidth - 16)"
        :h="1"
        @click="selectedCollection && openFavoriteFolder(selectedCollection.slug)"
      >
        <TText
          :x="0"
          :y="0"
          :w="Math.max(1, listWidth - 16)"
          :value="selectedCollection?.name ?? ''"
          :style="THEME.title"
        />
      </TView>
    </template>
    <TBox
      v-if="showingFavoriteFolders"
      :x="detailX"
      :y="workspaceY"
      :w="detailWidth"
      :h="middleHeight"
      border
      :title="collectionLabel"
      :padding="0"
      :style="ui.focus === 'detail' ? THEME.borderActive : THEME.border"
    >
      <TText
        :x="1"
        :y="1"
        :w="Math.max(1, detailWidth - 2)"
        :value="selectedCollection?.name ?? `选择一个${collectionLabel}`"
        :style="THEME.title"
      />
      <TText
        :x="1"
        :y="3"
        :w="Math.max(1, detailWidth - 2)"
        :value="loadingCatalog ? `◐ 加载${collectionLabel}中…` : collectionDescription"
        :style="loadingCatalog ? THEME.warning : THEME.muted"
      />
    </TBox>
    <ProblemDetail
      v-else
      :problem="selectedProblem"
      :detail="selectedDetail"
      :x="detailX"
      :y="workspaceY"
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
    <TText
      :x="editorX"
      :y="workspaceY"
      :w="1"
      :z-index="3"
      :h="middleHeight - 1"
      :value="Array.from({ length: middleHeight - 1 }, () => '│').join('\n')"
      :style="hoveredDivider === 'width' ? THEME.dividerHover : THEME.border"
    />
    <CodePane
      v-if="editor"
      ref="codePane"
      :editor="editor"
      :x="editorX"
      :y="workspaceY"
      :width="editorWidth"
      :height="middleHeight"
      :focused="ui.focus === 'editor'"
    />
    <LogPanel
      :logs="controller.state.logs"
      :test-result="testResult"
      :x="0"
      :y="logY"
      :width="screen.cols"
      :height="logHeight"
      :focused="ui.focus === 'log'"
      :scroll="ui.logScroll"
      @focus="ui.focus = 'log'"
      @update-scroll="ui.logScroll = $event"
    />
    <TText
      v-if="!listCollapsed"
      :x="detailX"
      :y="workspaceY"
      :w="1"
      :z-index="3"
      :h="middleHeight - 1"
      :value="Array.from({ length: middleHeight - 1 }, () => '│').join('\n')"
      :style="hoveredDivider === 'list' ? THEME.dividerHover : THEME.border"
    />
    <TText
      v-if="hoveredDivider && pointer"
      :z-index="5"
      :w="1"
      :h="1"
      :x="
        hoveredDivider !== 'log'
          ? hoveredDivider === 'list'
            ? detailX
            : editorX
          : Math.max(32, Math.min(screen.cols - 1, pointer.x))
      "
      :y="hoveredDivider !== 'log' ? Math.max(workspaceY, Math.min(logY - 1, pointer.y)) : logY"
      :value="hoveredDivider === 'log' ? '↕' : '↔'"
      :style="THEME.dividerHover"
    />
    <TText
      :x="1"
      :y="footerY"
      :w="12"
      value="[ 保存 F2 ]"
      :style="actionBusy ? THEME.muted : THEME.selected"
    />
    <TText
      :x="15"
      :y="footerY"
      :w="12"
      value="[ 执行 F3 ]"
      :style="actionBusy ? THEME.muted : THEME.selected"
    />
    <TText
      :x="29"
      :y="footerY"
      :w="12"
      value="[ 提交 F4 ]"
      :style="actionBusy ? THEME.muted : THEME.selected"
    />
    <TText
      :x="43"
      :y="footerY"
      :w="Math.max(1, screen.cols - 44)"
      :value="actionMessage"
      :style="THEME.warning"
    />
    <TText
      :x="1"
      :y="footerY + 1"
      :w="Math.max(1, screen.cols - 2)"
      :value="
        controller.state.lastError
          ? `${controller.state.lastError.code}: ${controller.state.lastError.message}`
          : showingFavoriteFolders
            ? 'F6 切换栏目 · b 收起列表 · ↑↓/jk 选择收藏夹 · Enter 打开 · 拖动中线调整宽度'
            : 'F6 切换栏目 · b 收起列表 · e 编辑 · Micro Ctrl+Q 退出 · 拖动中线调整宽度'
      "
      :style="controller.state.lastError ? THEME.error : THEME.muted"
    />
    <TText
      :x="1"
      :y="footerY + 2"
      :w="Math.max(1, screen.cols - 2)"
      value="/ 搜索 · o 官方题单 · a 收藏 · c Token登录 · v 页面 · [ ] 目录 · Esc 返回 · f 收藏筛选 · d 难度 · l 日志 · r 刷新 · q 退出"
      :style="THEME.muted"
    />
    <HelpOverlay v-if="ui.helpOpen" :cols="screen.cols" :rows="screen.rows" />
    <SubmitDialog
      v-if="controller.state.submitDialog.open"
      :language="controller.state.language"
      :cols="screen.cols"
      :rows="screen.rows"
      :problem="submitProblem"
      :test-status="submitTestStatus"
    />
    <CookieLoginDialog
      v-if="controller.state.cookieLogin.open"
      :cols="screen.cols"
      :rows="screen.rows"
      :session-length="ui.cookieSessionDraft.length"
      :csrf-length="ui.cookieCsrfDraft.length"
      :active-field="ui.cookieField"
      :submitting="controller.state.cookieLogin.submitting"
      :error="controller.state.cookieLogin.error"
    />
  </template>
</template>
