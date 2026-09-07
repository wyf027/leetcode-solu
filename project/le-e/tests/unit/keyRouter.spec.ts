import { describe, expect, it, vi } from 'vitest'

import type { AppController } from '../../src/application/createAppController'
import { createKeyRouter } from '../../src/application/keyRouter'
import type { UiInteractionState } from '../../src/application/keyRouter'
import type { TerminalInputEvent } from '../../src/application/terminalInput'

const keydown = (
  key: string,
  modifiers: { shiftKey?: boolean; ctrlKey?: boolean } = {},
): TerminalInputEvent => ({ type: 'keydown', key, ...modifiers }) as TerminalInputEvent
const paste = (text: string): TerminalInputEvent => ({ type: 'paste', text }) as TerminalInputEvent

function harness(initialFocus: UiInteractionState['focus'] = 'problems') {
  const moveSelection = vi.fn()
  const openCookieLogin = vi.fn()
  const dismissCookieLogin = vi.fn()
  const loginWithSessionTokens = vi.fn(async () => true)
  const controller = {
    state: {
      submitDialog: { open: false },
      cookieLogin: { open: false, submitting: false, error: null },
      viewMode: 'all',
      favoritePage: 'folders',
      filters: { query: '', difficulty: 'all', starredOnly: false },
    },
    moveSelection,
    openCookieLogin,
    dismissCookieLogin,
    loginWithSessionTokens,
  } as unknown as AppController
  const ui: UiInteractionState = {
    focus: initialFocus,
    searchMode: false,
    searchDraft: '',
    searchOriginal: '',
    cookieSessionDraft: '',
    cookieCsrfDraft: '',
    cookieField: 'session',
    helpOpen: false,
    detailScroll: 0,
    logScroll: 0,
  }
  return {
    controller,
    ui,
    moveSelection,
    openCookieLogin,
    dismissCookieLogin,
    loginWithSessionTokens,
    route: createKeyRouter({ controller, ui, requestExit: vi.fn() }),
  }
}

describe('createKeyRouter pane focus', () => {
  it('uses Tab and Shift+Tab to switch only between the problem and detail panes', () => {
    const { route, ui } = harness('problems')

    expect(route(keydown('Tab'))).toBe(true)
    expect(ui.focus).toBe('detail')
    expect(route(keydown('Tab'))).toBe(true)
    expect(ui.focus).toBe('problems')
    expect(route(keydown('Tab', { shiftKey: true }))).toBe(true)
    expect(ui.focus).toBe('detail')
    route(keydown('BackTab'))
    expect(ui.focus).toBe('problems')
    route(keydown('ISO_Left_Tab'))
    expect(ui.focus).toBe('detail')

    ui.focus = 'filters'
    route(keydown('Tab'))
    expect(ui.focus).toBe('problems')
    ui.focus = 'log'
    route(keydown('Tab'))
    expect(ui.focus).toBe('problems')
  })

  it('moves the list with arrows on the left and scrolls content on the right', () => {
    const { route, ui, moveSelection } = harness('problems')

    route(keydown('ArrowDown'))
    expect(moveSelection).toHaveBeenLastCalledWith(1)
    route(keydown('ArrowUp'))
    expect(moveSelection).toHaveBeenLastCalledWith(-1)
    route(keydown('j'))
    expect(moveSelection).toHaveBeenLastCalledWith(1)
    route(keydown('k'))
    expect(moveSelection).toHaveBeenLastCalledWith(-1)

    ui.focus = 'detail'
    route(keydown('ArrowDown'))
    route(keydown('j'))
    expect(ui.detailScroll).toBe(2)
    route(keydown('ArrowUp'))
    route(keydown('k'))
    expect(ui.detailScroll).toBe(0)
    route(keydown('ArrowDown'))
    expect(ui.detailScroll).toBe(1)
    expect(moveSelection).toHaveBeenCalledTimes(4)
  })

  it('jumps problems by 10 with Shift and by 100 with Control', () => {
    const { controller, route, ui, moveSelection } = harness('problems')

    route(keydown('ArrowDown', { shiftKey: true }))
    expect(moveSelection).toHaveBeenLastCalledWith(10)
    route(keydown('ArrowUp', { ctrlKey: true }))
    expect(moveSelection).toHaveBeenLastCalledWith(-100)
    route(keydown('ArrowDown', { shiftKey: true, ctrlKey: true }))
    expect(moveSelection).toHaveBeenLastCalledWith(100)

    ui.focus = 'detail'
    route(keydown('ArrowDown', { shiftKey: true }))
    route(keydown('ArrowDown', { ctrlKey: true }))
    expect(ui.detailScroll).toBe(2)

    ui.focus = 'filters'
    route(keydown('ArrowDown', { ctrlKey: true }))
    expect(moveSelection).toHaveBeenLastCalledWith(1)

    ui.focus = 'detail'
    route(keydown('ArrowUp', { ctrlKey: true }))
    expect(ui.detailScroll).toBe(1)

    ui.focus = 'problems'
    controller.state.viewMode = 'favorites'
    controller.state.favoritePage = 'folders'
    route(keydown('ArrowDown', { ctrlKey: true }))
    expect(moveSelection).toHaveBeenLastCalledWith(1)
  })

  it('keeps Tab inside an active search until the query is confirmed or cancelled', () => {
    const { route, ui } = harness('filters')
    ui.searchMode = true

    route(keydown('Tab'))

    expect(ui.focus).toBe('filters')
    expect(ui.searchMode).toBe(true)
  })

  it('captures each token separately and submits after the second Enter', () => {
    const { controller, loginWithSessionTokens, route, ui } = harness()
    controller.state.cookieLogin.open = true

    route(paste('session-example'))
    expect(ui.cookieSessionDraft).toBe('session-example')
    route(keydown('Enter'))
    expect(ui.cookieField).toBe('csrf')
    expect(loginWithSessionTokens).not.toHaveBeenCalled()

    route(paste('csrf-example'))
    expect(ui.cookieCsrfDraft).toBe('csrf-example')
    route(keydown('Enter'))

    expect(loginWithSessionTokens).toHaveBeenCalledWith('session-example', 'csrf-example')
    expect(ui.cookieSessionDraft).toBe('')
    expect(ui.cookieCsrfDraft).toBe('')
    expect(ui.cookieField).toBe('session')
  })

  it('switches Cookie token fields with Tab and Shift+Tab', () => {
    const { controller, route, ui } = harness()
    controller.state.cookieLogin.open = true

    route(keydown('Tab'))
    expect(ui.cookieField).toBe('csrf')
    route(keydown('Tab', { shiftKey: true }))
    expect(ui.cookieField).toBe('session')
  })

  it('keeps both drafts and focuses a missing token instead of calling the CLI', () => {
    const { controller, loginWithSessionTokens, route, ui } = harness()
    controller.state.cookieLogin.open = true
    ui.cookieSessionDraft = 'session-example'
    ui.cookieField = 'csrf'

    route(keydown('Enter'))

    expect(loginWithSessionTokens).not.toHaveBeenCalled()
    expect(ui.cookieSessionDraft).toBe('session-example')
    expect(ui.cookieCsrfDraft).toBe('')
    expect(ui.cookieField).toBe('csrf')
    expect(controller.state.cookieLogin.error).toBe('请填写 csrftoken。')
  })

  it('opens Cookie login with c and clears its draft on Escape', () => {
    const { controller, dismissCookieLogin, openCookieLogin, route, ui } = harness()

    route(keydown('c'))
    expect(openCookieLogin).toHaveBeenCalledOnce()

    controller.state.cookieLogin.open = true
    ui.cookieSessionDraft = 'temporary-session'
    ui.cookieCsrfDraft = 'temporary-csrf'
    ui.cookieField = 'csrf'
    route(keydown('Escape'))

    expect(dismissCookieLogin).toHaveBeenCalledOnce()
    expect(ui.cookieSessionDraft).toBe('')
    expect(ui.cookieCsrfDraft).toBe('')
    expect(ui.cookieField).toBe('session')
  })

  it('allows Escape to cancel Cookie verification while it is submitting', () => {
    const { controller, dismissCookieLogin, route, ui } = harness()
    controller.state.cookieLogin.open = true
    controller.state.cookieLogin.submitting = true
    ui.cookieSessionDraft = 'temporary-session'
    ui.cookieCsrfDraft = 'temporary-csrf'

    route(keydown('Escape'))

    expect(dismissCookieLogin).toHaveBeenCalledOnce()
    expect(ui.cookieSessionDraft).toBe('')
    expect(ui.cookieCsrfDraft).toBe('')
  })
})
