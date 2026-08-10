import {
  backspaceCode,
  deleteCodeForward,
  ensureCodeCursorVisible,
  insertCodeNewline,
  insertCodeText,
  moveCodeEnd,
  moveCodeHome,
  moveCodeLeft,
  moveCodePage,
  moveCodeRight,
  moveCodeVertical,
} from './codeBuffer'
import type { AppController } from './createAppController'
import type { TerminalInputEvent } from './terminalInput'

export type UiFocus = 'filters' | 'problems' | 'detail' | 'log'

export interface UiInteractionState {
  focus: UiFocus
  searchMode: boolean
  searchDraft: string
  searchOriginal: string
  helpOpen: boolean
  detailScroll: number
  logScroll: number
}

export interface KeyRouterOptions {
  readonly controller: AppController
  readonly ui: UiInteractionState
  readonly requestExit: () => void
  readonly editorViewport: () => { rows: number; columns: number }
}

const focusOrder: readonly UiFocus[] = ['filters', 'problems', 'detail', 'log']
const specialKeys = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  'Escape',
  'Backspace',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Tab',
])

function ctrl(event: TerminalInputEvent, key: string): boolean {
  return (
    event.type === 'keydown' &&
    event.ctrlKey === true &&
    event.altKey !== true &&
    event.metaKey !== true &&
    event.key.toLocaleLowerCase() === key
  )
}

function printable(event: TerminalInputEvent): string | null {
  if (
    event.type !== 'keydown' ||
    event.ctrlKey === true ||
    event.altKey === true ||
    event.metaKey === true ||
    event.key === '' ||
    specialKeys.has(event.key)
  ) {
    return null
  }
  return event.key
}

function rotateFocus(ui: UiInteractionState, backwards: boolean): void {
  const current = focusOrder.indexOf(ui.focus)
  const offset = backwards ? -1 : 1
  ui.focus = focusOrder[(current + offset + focusOrder.length) % focusOrder.length] ?? 'problems'
}

function cycleDifficulty(controller: AppController): void {
  const values = ['all', 'Easy', 'Medium', 'Hard'] as const
  const index = values.indexOf(controller.state.filters.difficulty)
  controller.setDifficulty(values[(index + 1) % values.length] ?? 'all')
}

async function closeEditor(
  controller: AppController,
  intent: 'back' | 'quit',
  requestExit: () => void,
): Promise<void> {
  const result = await controller.requestEditorClose(intent)
  if (result === 'closed' && intent === 'quit') requestExit()
}

async function saveAndCloseEditor(
  controller: AppController,
  requestExit: () => void,
): Promise<void> {
  const intent = controller.state.editor.pendingCloseIntent
  if (intent === null || !(await controller.saveEditor())) return
  await closeEditor(controller, intent, requestExit)
}

function routeEditor(event: TerminalInputEvent, options: KeyRouterOptions): boolean {
  const { controller, requestExit } = options
  const editor = controller.state.editor

  if (editor.pendingCloseIntent !== null) {
    if (event.type !== 'keydown') return true
    const key = event.key.toLocaleLowerCase()
    if (event.key === 'Enter' || key === 's') {
      void saveAndCloseEditor(controller, requestExit)
    } else if (key === 'd' || key === 'y') {
      void controller.confirmEditorDiscard().then((intent) => {
        if (intent === 'quit') requestExit()
      })
    } else if (key === 'n' || event.key === 'Escape') {
      controller.cancelEditorClose()
    }
    return true
  }

  if (ctrl(event, 'c')) {
    void closeEditor(controller, 'quit', requestExit)
    return true
  }
  if (event.type === 'keydown' && event.key === 'Escape') {
    void closeEditor(controller, 'back', requestExit)
    return true
  }
  if (editor.phase !== 'editing' || editor.buffer === null) return true

  const buffer = editor.buffer
  const viewport = options.editorViewport()
  if (event.type === 'paste' && event.text) insertCodeText(buffer, event.text)
  else if (event.type === 'input' && event.text) insertCodeText(buffer, event.text)
  else if (ctrl(event, 's')) void controller.saveEditor()
  else if (event.type === 'keydown') {
    if (event.key === 'Enter') insertCodeNewline(buffer)
    else if (event.key === 'Backspace') backspaceCode(buffer)
    else if (event.key === 'Delete') deleteCodeForward(buffer)
    else if (event.key === 'ArrowLeft') moveCodeLeft(buffer)
    else if (event.key === 'ArrowRight') moveCodeRight(buffer)
    else if (event.key === 'ArrowUp') moveCodeVertical(buffer, -1)
    else if (event.key === 'ArrowDown') moveCodeVertical(buffer, 1)
    else if (event.key === 'Home') moveCodeHome(buffer)
    else if (event.key === 'End') moveCodeEnd(buffer)
    else if (event.key === 'PageUp') moveCodePage(buffer, -1, viewport.rows)
    else if (event.key === 'PageDown') moveCodePage(buffer, 1, viewport.rows)
    else if (event.key === 'Tab') insertCodeText(buffer, '  ')
    else {
      const value = printable(event)
      if (value !== null) insertCodeText(buffer, value)
    }
  }

  ensureCodeCursorVisible(buffer, viewport.rows, viewport.columns)
  return true
}

function routeSearch(event: TerminalInputEvent, options: KeyRouterOptions): boolean {
  const { controller, ui } = options
  if (event.type === 'paste' && event.text) {
    ui.searchDraft = `${ui.searchDraft}${event.text.replace(/\s+/g, ' ')}`.slice(0, 120)
    return true
  }
  if (event.type !== 'keydown') return true
  if (event.key === 'Enter') {
    controller.setQuery(ui.searchDraft)
    ui.searchMode = false
  } else if (event.key === 'Escape') {
    ui.searchDraft = ui.searchOriginal
    ui.searchMode = false
  } else if (event.key === 'Backspace') {
    ui.searchDraft = [...ui.searchDraft].slice(0, -1).join('')
  } else {
    const value = printable(event)
    if (value !== null) ui.searchDraft = `${ui.searchDraft}${value}`.slice(0, 120)
  }
  return true
}

function moveFocusedArea(controller: AppController, ui: UiInteractionState, delta: number): void {
  if (ui.focus === 'problems' || ui.focus === 'filters') controller.moveSelection(delta)
  else if (ui.focus === 'detail') ui.detailScroll = Math.max(0, ui.detailScroll + delta)
  else ui.logScroll = Math.max(0, ui.logScroll - delta)
}

export function createKeyRouter(options: KeyRouterOptions): (event: TerminalInputEvent) => boolean {
  const { controller, ui, requestExit } = options
  return (event) => {
    if (controller.state.editor.phase !== 'idle') return routeEditor(event, options)

    if (ctrl(event, 'c')) {
      requestExit()
      return true
    }
    if (ui.helpOpen) {
      if (event.type === 'keydown' && (event.key === '?' || event.key === 'Escape')) {
        ui.helpOpen = false
      }
      return true
    }
    if (controller.state.submitDialog.open) {
      if (event.type === 'keydown') void controller.handleSubmitDialogKey(event.key)
      return true
    }
    if (ui.searchMode) return routeSearch(event, options)
    if (event.type !== 'keydown') return false

    const key = event.key
    const lower = key.toLocaleLowerCase()
    if (key === 'Tab') rotateFocus(ui, event.shiftKey === true)
    else if (key === 'ArrowUp' || lower === 'k') moveFocusedArea(controller, ui, -1)
    else if (key === 'ArrowDown' || lower === 'j') moveFocusedArea(controller, ui, 1)
    else if (key === 'Enter') {
      ui.focus = 'detail'
      ui.detailScroll = 0
      void controller.loadSelectedDetail()
    } else if (key === '/') {
      ui.focus = 'filters'
      ui.searchMode = true
      ui.searchOriginal = controller.state.filters.query
      ui.searchDraft = controller.state.filters.query
    } else if (lower === 'f') controller.toggleStarredOnly()
    else if (lower === 'v') controller.toggleView()
    else if (key === '[') controller.moveFavoriteFolder(-1)
    else if (key === ']') controller.moveFavoriteFolder(1)
    else if (lower === 'a') void controller.toggleFavoriteSelected()
    else if (lower === 'd') cycleDifficulty(controller)
    else if (key === 'E') void controller.editSelectedInVim()
    else if (lower === 'e') void controller.editSelected()
    else if (lower === 't') void controller.testSelected()
    else if (lower === 's') controller.openSubmitDialog()
    else if (lower === 'l') controller.toggleLog()
    else if (lower === 'r') void controller.refresh()
    else if (key === '?') ui.helpOpen = true
    else if (lower === 'q') requestExit()
    else return false
    return true
  }
}
