import { reactive } from 'vue'

/** Serialize context changes against Micro's save acknowledgement and bridge cleanup. */
export function createEditorWorkspace(options: {
  active: () => boolean
  available: () => boolean
  idle: () => boolean
  saveAndClose: () => Promise<boolean>
  edit: () => Promise<boolean>
  focus: () => void
  error: () => string
}) {
  const state = reactive({ busy: false, error: '' })
  let session: Promise<boolean> | undefined
  const open = () => {
    if (options.active()) {
      options.focus()
      return
    }
    if (session || !options.available() || !options.idle()) return
    const pending = options.edit()
    session = pending
    void pending
      .catch((error: unknown) => {
        state.error = error instanceof Error ? error.message : '无法打开编辑器。'
      })
      .finally(() => {
        if (session === pending) session = undefined
      })
  }
  const run = async (action: () => unknown, reopen = false): Promise<void> => {
    if (state.busy || (!options.idle() && !options.active())) return
    state.busy = true
    state.error = ''
    try {
      if (options.active()) {
        if (!(await options.saveAndClose())) {
          state.error = options.error() || '保存失败，已取消切换。'
          return
        }
        const pending = session
        await pending
        if (session === pending) session = undefined
      }
      if (!options.idle()) return
      const result = await action()
      if (reopen && result !== false) open()
    } catch (error) {
      state.error = error instanceof Error ? error.message : '切换失败，请重试。'
    } finally {
      state.busy = false
    }
  }
  return { state, open, run }
}
