import { describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, nextTick, reactive, ssrContextKey } from 'vue'

import App from '../../src/App.vue'
import { createTerminalInputBus } from '../../src/application/terminalInput'

function workspace() {
  const state = reactive({
    activeOperation: null as 'edit' | null,
    selectedProblemId: 10,
    filters: { query: '' },
    viewMode: 'all',
    favoritePage: 'problems',
    cookieLogin: { open: false },
    submitDialog: { open: false },
  })
  const editor = {
    state: reactive({ active: false, error: 'fixture save failed' }),
    save: vi.fn(async () => false),
  }
  let finish = () => {}
  const controller = {
    state,
    editSelected: vi.fn(() => {
      state.activeOperation = 'edit'
      editor.state.active = true
      return new Promise<boolean>((resolve) => {
        finish = () => {
          editor.state.active = false
          state.activeOperation = null
          resolve(true)
        }
      })
    }),
    moveSelection: vi.fn((delta: number) => {
      state.selectedProblemId += delta
    }),
    testSelected: vi.fn(),
    openSubmitDialog: vi.fn(),
  }
  const inputBus = createTerminalInputBus()
  const app = createApp({})
  app.provide(ssrContextKey, {})
  const scope = effectScope()
  const component = App as unknown as {
    setup: (props: object, context: { expose: () => void }) => unknown
  }
  // Exercise input setup without mounting the terminal renderer.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  scope.run(() =>
    app.runWithContext(() =>
      component.setup(
        { controller, editor, inputBus, screen: { cols: 160, rows: 45 }, requestExit: vi.fn() },
        { expose() {} },
      ),
    ),
  )
  return {
    controller,
    editor,
    input: (key: string) => inputBus.dispatch({ type: 'keydown', key }),
    finish: () => finish(),
    close: () => scope.stop(),
  }
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('Micro input routing in the app', () => {
  it('preserves the selected problem when saving fails after canceling search', async () => {
    const { controller, editor, input, finish, close } = workspace()
    try {
      input('e')
      await nextTick()
      input('F6')
      input('/')
      input('Escape')
      input('ArrowDown')
      await settle()

      expect(editor.save).toHaveBeenCalledWith(true)
      expect(controller.state.selectedProblemId).toBe(10)
      expect(editor.state.active).toBe(true)
    } finally {
      finish()
      close()
    }
  })

  it('waits for the editor opened by uppercase E to exit after saving', async () => {
    const { controller, editor, input, finish, close } = workspace()
    editor.save.mockResolvedValue(true)
    try {
      input('E')
      await nextTick()
      input('F6')
      input('F6')
      input('ArrowDown')
      await settle()

      expect(editor.save).toHaveBeenCalledWith(true)
      expect(controller.state.selectedProblemId).toBe(10)
      finish()
      await settle()
      expect(controller.state.selectedProblemId).toBe(11)
    } finally {
      finish()
      close()
    }
  })

  it.each(['T', 'S'])('requires a save before uppercase %s outside the editor', async (key) => {
    const { controller, editor, input, finish, close } = workspace()
    try {
      input('e')
      await nextTick()
      input('F6')
      input(key)
      await settle()

      expect(editor.save).toHaveBeenCalledWith(false)
      expect(controller.testSelected).not.toHaveBeenCalled()
      expect(controller.openSubmitDialog).not.toHaveBeenCalled()
    } finally {
      finish()
      close()
    }
  })
})
