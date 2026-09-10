import type { AppController } from './createAppController'
import type { TerminalInputEvent } from './terminalInput'

export type UiFocus = 'filters' | 'problems' | 'detail' | 'log' | 'editor'
export type CookieLoginField = 'session' | 'csrf'

export interface UiInteractionState {
  focus: UiFocus
  searchMode: boolean
  searchDraft: string
  searchOriginal: string
  cookieSessionDraft: string
  cookieCsrfDraft: string
  cookieField: CookieLoginField
  helpOpen: boolean
  detailScroll: number
  logScroll: number
}

export interface KeyRouterOptions {
  readonly controller: AppController
  readonly ui: UiInteractionState
  readonly requestExit: () => void
}

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
  'BackTab',
  'ISO_Left_Tab',
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

function switchMainPane(ui: UiInteractionState): void {
  ui.focus = ui.focus === 'problems' ? 'detail' : 'problems'
}

function cycleDifficulty(controller: AppController): void {
  const values = ['all', 'Easy', 'Medium', 'Hard'] as const
  const index = values.indexOf(controller.state.filters.difficulty)
  controller.setDifficulty(values[(index + 1) % values.length] ?? 'all')
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

const COOKIE_INPUT_LIMIT = 16_384

function clearCookieDrafts(ui: UiInteractionState): void {
  ui.cookieSessionDraft = ''
  ui.cookieCsrfDraft = ''
  ui.cookieField = 'session'
}

function appendCookieDraft(ui: UiInteractionState, value: string): void {
  if (ui.cookieField === 'session') {
    ui.cookieSessionDraft = `${ui.cookieSessionDraft}${value}`.slice(0, COOKIE_INPUT_LIMIT)
  } else {
    ui.cookieCsrfDraft = `${ui.cookieCsrfDraft}${value}`.slice(0, COOKIE_INPUT_LIMIT)
  }
}

function removeCookieDraftCharacter(ui: UiInteractionState): void {
  if (ui.cookieField === 'session') {
    ui.cookieSessionDraft = [...ui.cookieSessionDraft].slice(0, -1).join('')
  } else {
    ui.cookieCsrfDraft = [...ui.cookieCsrfDraft].slice(0, -1).join('')
  }
}

function routeCookieLogin(event: TerminalInputEvent, options: KeyRouterOptions): boolean {
  const { controller, ui } = options
  if (controller.state.cookieLogin.submitting) {
    if (event.type === 'keydown' && event.key === 'Escape') {
      clearCookieDrafts(ui)
      controller.dismissCookieLogin()
    }
    return true
  }
  if (event.type === 'paste' && event.text) {
    appendCookieDraft(ui, event.text)
    controller.state.cookieLogin.error = null
    return true
  }
  if (event.type !== 'keydown') return true
  if (event.key === 'Tab' || event.key === 'BackTab' || event.key === 'ISO_Left_Tab') {
    ui.cookieField = ui.cookieField === 'session' ? 'csrf' : 'session'
    controller.state.cookieLogin.error = null
  } else if (event.key === 'Enter') {
    if (ui.cookieField === 'session') {
      ui.cookieField = 'csrf'
      controller.state.cookieLogin.error = null
      return true
    }
    if (ui.cookieSessionDraft.trim() === '') {
      ui.cookieField = 'session'
      controller.state.cookieLogin.error = '请填写 LEETCODE_SESSION。'
      return true
    }
    if (ui.cookieCsrfDraft.trim() === '') {
      controller.state.cookieLogin.error = '请填写 csrftoken。'
      return true
    }
    const session = ui.cookieSessionDraft
    const csrf = ui.cookieCsrfDraft
    clearCookieDrafts(ui)
    void controller.loginWithSessionTokens(session, csrf)
  } else if (event.key === 'Escape') {
    clearCookieDrafts(ui)
    controller.dismissCookieLogin()
  } else if (event.key === 'Backspace') {
    removeCookieDraftCharacter(ui)
    controller.state.cookieLogin.error = null
  } else {
    const value = printable(event)
    if (value !== null) {
      appendCookieDraft(ui, value)
      controller.state.cookieLogin.error = null
    }
  }
  return true
}

function problemMovementStep(
  controller: AppController,
  ui: UiInteractionState,
  event: TerminalInputEvent,
): number {
  if (ui.focus !== 'problems') return 1
  if (controller.state.viewMode === 'favorites' && controller.state.favoritePage === 'folders') {
    return 1
  }
  if (event.type !== 'keydown') return 1
  if (event.ctrlKey === true) return 100
  if (event.shiftKey === true) return 10
  return 1
}

function moveFocusedArea(
  controller: AppController,
  ui: UiInteractionState,
  delta: number,
  problemStep: number,
): void {
  if (ui.focus === 'problems' || ui.focus === 'filters') {
    controller.moveSelection(delta * problemStep)
  } else if (ui.focus === 'detail') ui.detailScroll = Math.max(0, ui.detailScroll + delta)
  else {
    const id = controller.state.selectedProblemId
    const failed = id !== null && controller.state.testResults.get(id)?.outcome === 'failed'
    ui.logScroll = Math.max(0, ui.logScroll + (failed ? delta : -delta))
  }
}

export function createKeyRouter(options: KeyRouterOptions): (event: TerminalInputEvent) => boolean {
  const { controller, ui, requestExit } = options
  return (event) => {
    if (ctrl(event, 'c')) {
      requestExit()
      return true
    }
    if (controller.state.cookieLogin.open) return routeCookieLogin(event, options)
    if (ui.helpOpen) {
      if (event.type === 'keydown' && (event.key === '?' || event.key === 'Escape')) {
        ui.helpOpen = false
      }
      return true
    }
    if (controller.state.submitDialog.open) {
      const key =
        event.type === 'keydown'
          ? event.key
          : event.type === 'input' && event.inputType === 'insertLineBreak'
            ? 'Enter'
            : null
      if (key !== null) void controller.handleSubmitDialogKey(key)
      return true
    }
    if (ui.searchMode) return routeSearch(event, options)
    if (event.type !== 'keydown') return false

    const key = event.key
    const lower = key.toLocaleLowerCase()
    if (key === 'Tab' || key === 'BackTab' || key === 'ISO_Left_Tab') switchMainPane(ui)
    else if (key === 'ArrowUp' || lower === 'k') {
      const step = key === 'ArrowUp' ? problemMovementStep(controller, ui, event) : 1
      moveFocusedArea(controller, ui, -1, step)
    } else if (key === 'ArrowDown' || lower === 'j') {
      const step = key === 'ArrowDown' ? problemMovementStep(controller, ui, event) : 1
      moveFocusedArea(controller, ui, 1, step)
    } else if (key === 'Enter') {
      if (
        controller.state.viewMode === 'favorites' &&
        controller.state.favoritePage === 'folders'
      ) {
        controller.openFavoriteFolder()
        ui.focus = 'problems'
      } else {
        ui.focus = 'detail'
        ui.detailScroll = 0
        void controller.loadSelectedDetail()
      }
    } else if (key === 'Escape' || key === 'Backspace') {
      if (!controller.closeFavoriteFolder()) return false
      ui.focus = 'problems'
      ui.detailScroll = 0
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
    else if (lower === 'c') {
      clearCookieDrafts(ui)
      controller.openCookieLogin()
    } else if (lower === 'd') cycleDifficulty(controller)
    else if (lower === 'g') controller.cycleLanguage()
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
