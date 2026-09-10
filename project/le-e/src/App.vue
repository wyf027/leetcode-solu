<script setup lang="ts">
import { TBox, TText } from '@simon_he/vue-tui'
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
const footerHeight = 3
const listCollapsed = ref(false)
const splitRatio = ref(0.5)
const requestedListWidth = ref<number | null>(null)
const requestedLogHeight = ref<number | null>(null)
const availableHeight = computed(() => props.screen.rows - headerHeight - footerHeight - 1)
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
const detailX = computed(() => listWidth.value + 1)
const detailAreaWidth = computed(() => props.screen.cols - detailX.value)
const workspaceY = computed(() => headerHeight)
const middleHeight = computed(() => availableHeight.value - logHeight.value)
const detailWidth = computed(() =>
  Math.max(
    30,
    Math.min(
      detailAreaWidth.value - 31,
      Math.floor((detailAreaWidth.value - 1) * splitRatio.value),
    ),
  ),
)
const editorX = computed(() => detailX.value + detailWidth.value + 1)
const editorWidth = computed(() => props.screen.cols - editorX.value)
const logY = computed(() => workspaceY.value + middleHeight.value + 1)
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
  if (props.controller.state.activeOperation === 'edit') return
  if (!props.controller.openFavoriteFolder(slug)) return
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
    position.x === listWidth.value &&
    position.y >= workspaceY.value &&
    position.y < logY.value - 1
  )
    return 'list'
  if (position.y === logY.value - 1) return 'log'
  if (
    position.x === editorX.value - 1 &&
    position.y >= workspaceY.value &&
    position.y < logY.value - 1
  )
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
let editTask: Promise<boolean> | undefined
const actionMessage = ref('')
const editorAction = async (action: 'save' | 'test' | 'submit') => {
  if (actionBusy.value || props.controller.state.submitDialog.open) return
  if (props.controller.state.activeOperation !== null && !props.editor?.state.active) return
  actionBusy.value = true
  actionMessage.value = '正在保存…'
  try {
    if (props.editor?.state.active) {
      if (!(await props.editor.save(action !== 'save'))) {
        actionMessage.value = props.editor.state.error
        return
      }
      if (action !== 'save' && !(await editTask)) {
        actionMessage.value = '编辑器未正常结束，已取消操作。'
        return
      }
    } else if (action === 'save') {
      actionMessage.value = '请先按 e 打开代码编辑器。'
      return
    }
    if (action === 'save') actionMessage.value = '已保存。'
    else {
      actionMessage.value = ''
      ui.focus = 'log'
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
    return props.editor?.state.active ? true : handleInput(event)
  }
  const modal =
    ui.helpOpen ||
    ui.searchMode ||
    props.controller.state.cookieLogin.open ||
    props.controller.state.submitDialog.open
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
  if (event.type === 'wheel') {
    if (dragging.value || !Number.isFinite(event.deltaY) || event.deltaY === 0) return true
    const step = Math.sign(event.deltaY) * 3
    if (event.cellX < 0 || event.cellX >= props.screen.cols) return true
    if (event.cellY >= logY.value && event.cellY < footerY.value) {
      ui.logScroll = Math.max(
        0,
        ui.logScroll + (testResult.value?.outcome === 'failed' ? step : -step),
      )
    } else if (event.cellY >= workspaceY.value && event.cellY < logY.value - 1) {
      if (!listCollapsed.value && event.cellX < listWidth.value) {
        if (showingFavoriteFolders.value) folderList.value?.scrollBy(step)
        else problemList.value?.scrollBy(step)
      } else if (event.cellX >= detailX.value && event.cellX < editorX.value - 1) {
        ui.detailScroll = Math.max(0, ui.detailScroll + step)
      } else if (event.cellX >= editorX.value) {
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
      event.cellX === editorX.value - 1 &&
      event.cellY >= workspaceY.value &&
      event.cellY < logY.value - 1
    ) {
      dragging.value = 'width'
      return true
    }
    if (
      event.type === 'pointerdown' &&
      !listCollapsed.value &&
      event.cellX === listWidth.value &&
      event.cellY >= workspaceY.value &&
      event.cellY < logY.value - 1
    ) {
      dragging.value = 'list'
      return true
    }
    if (event.type === 'pointerdown' && event.cellY === logY.value - 1) {
      dragging.value = 'log'
      return true
    }
    if (event.type === 'pointermove' && dragging.value) {
      if (dragging.value === 'width') {
        splitRatio.value =
          Math.max(30, Math.min(detailAreaWidth.value - 31, event.cellX - detailX.value)) /
          (detailAreaWidth.value - 1)
      } else if (dragging.value === 'list') {
        requestedListWidth.value = Math.max(24, Math.min(props.screen.cols - 62, event.cellX))
      } else {
        if (!props.controller.state.logExpanded) props.controller.toggleLog()
        requestedLogHeight.value = Math.max(
          3,
          Math.min(footerY.value - event.cellY - 1, availableHeight.value - 8),
        )
      }
      return true
    }
    if (event.type === 'click' || event.type === 'pointerdown') {
      if (event.cellY === headerHeight && event.cellX < listWidth.value) {
        if (event.type === 'click') toggleList()
        return true
      }
      if (event.cellY >= workspaceY.value && event.cellY < logY.value)
        ui.focus =
          event.cellX >= editorX.value
            ? 'editor'
            : !listCollapsed.value && event.cellX < listWidth.value
              ? 'problems'
              : 'detail'
      else if (event.cellY >= logY.value) ui.focus = 'log'
    }
    if (
      event.cellX > editorX.value &&
      event.cellX < props.screen.cols - 1 &&
      event.cellY > workspaceY.value &&
      event.cellY < logY.value - 1 &&
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
    editTask = props.controller.editSelected()
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
    <FavoriteFolderList
      v-if="showingFavoriteFolders && !listCollapsed"
      ref="folderList"
      :folders="controller.state.favoriteFolders"
      :selected-slug="controller.state.selectedFavoriteFolderSlug"
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
    />
    <TText
      :x="1"
      :y="headerHeight"
      :w="Math.max(1, listWidth - 1)"
      :z-index="2"
      :value="listCollapsed ? '▶' : `◀ 收起 [b] · ${problemListTitle}`"
      :style="THEME.title"
    />
    <TBox
      v-if="showingFavoriteFolders"
      :x="detailX"
      :y="workspaceY"
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
      :x="editorX - 1"
      :y="workspaceY"
      :w="1"
      :h="middleHeight"
      :value="Array.from({ length: middleHeight }, () => '│').join('\n')"
      :style="hoveredDivider === 'width' ? THEME.dividerHover : THEME.border"
    />
    <CodePane
      v-if="editor"
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
      :x="listWidth"
      :y="workspaceY"
      :w="1"
      :h="middleHeight"
      :value="Array.from({ length: middleHeight }, () => '│').join('\n')"
      :style="hoveredDivider === 'list' ? THEME.dividerHover : THEME.border"
    />
    <TText
      :x="0"
      :y="logY - 1"
      :w="screen.cols"
      :h="1"
      :value="'── ↕ 拖动调整日志高度 ' + '─'.repeat(screen.cols)"
      :style="hoveredDivider === 'log' ? THEME.dividerHover : THEME.border"
    />
    <TText
      v-if="hoveredDivider && pointer"
      :z-index="5"
      :w="1"
      :h="1"
      :x="
        hoveredDivider !== 'log'
          ? hoveredDivider === 'list'
            ? listWidth
            : editorX - 1
          : Math.max(32, Math.min(screen.cols - 1, pointer.x))
      "
      :y="hoveredDivider !== 'log' ? Math.max(workspaceY, Math.min(logY - 2, pointer.y)) : logY - 1"
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
      value="/ 搜索 · a 收藏 · c Token登录 · v 页面 · [ ] 收藏夹 · Esc 返回 · f 收藏筛选 · d 难度 · l 日志 · r 刷新 · q 退出"
      :style="THEME.muted"
    />
    <HelpOverlay v-if="ui.helpOpen" :cols="screen.cols" :rows="screen.rows" />
    <SubmitDialog
      v-if="controller.state.submitDialog.open"
      :language="controller.state.language"
      :cols="screen.cols"
      :rows="screen.rows"
      :problem="selectedProblem"
      :test-status="testStatus"
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
