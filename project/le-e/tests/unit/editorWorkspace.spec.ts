import { describe, expect, it, vi } from 'vitest'
import { createEditorWorkspace } from '../../src/application/editorWorkspace'

function harness() {
  let active = false
  let operation: string | null = null
  let finish!: (result: boolean) => void
  const edit = vi.fn(() => {
    operation = 'edit'
    active = true
    return new Promise<boolean>((resolve) => {
      finish = (result) => {
        active = false
        operation = null
        resolve(result)
      }
    })
  })
  const save = vi.fn(async () => {
    finish(true)
    return true
  })
  const focus = vi.fn()
  const workspace = createEditorWorkspace({
    active: () => active && operation === 'edit',
    available: () => true,
    idle: () => operation === null,
    edit,
    saveAndClose: save,
    focus,
    error: () => 'disk full',
  })
  return {
    workspace,
    edit,
    save,
    focus,
    finish: () => finish(true),
    operation: (value: string) => {
      operation = value
    },
  }
}

describe('editor workspace', () => {
  it('opens after detail resolution without waiting for Micro to exit', async () => {
    const { workspace, edit, finish } = harness()
    const load = vi.fn(async () => true)
    await workspace.run(load, true)
    expect(load).toHaveBeenCalledOnce()
    expect(edit).toHaveBeenCalledOnce()
    expect(workspace.state.busy).toBe(false)
    finish()
  })

  it('focuses the existing editor instead of spawning another', () => {
    const { workspace, edit, focus, finish } = harness()
    workspace.open()
    workspace.open()
    expect(edit).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledOnce()
    finish()
  })

  it('waits for save and bridge cleanup before selecting and reopening', async () => {
    const { workspace, edit, save, finish } = harness()
    workspace.open()
    let acknowledge!: (result: boolean) => void
    save.mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve
        }),
    )
    const select = vi.fn(async () => true)
    const switching = workspace.run(select, true)
    expect(select).not.toHaveBeenCalled()
    acknowledge(true)
    await Promise.resolve()
    expect(select).not.toHaveBeenCalled()
    finish()
    await switching
    expect(select).toHaveBeenCalledOnce()
    expect(edit).toHaveBeenCalledTimes(2)
    finish()
  })

  it('preserves the current source and selection if save fails', async () => {
    const { workspace, save, finish } = harness()
    workspace.open()
    save.mockResolvedValue(false)
    const select = vi.fn()
    await workspace.run(select, true)
    expect(select).not.toHaveBeenCalled()
    expect(workspace.state.error).toBe('disk full')
    expect(workspace.state.busy).toBe(false)
    finish()
  })

  it('ignores overlapping switches and judge requests', async () => {
    const { workspace, operation, finish } = harness()
    workspace.open()
    operation('test')
    const select = vi.fn()
    await workspace.run(select, true)
    expect(select).not.toHaveBeenCalled()
    operation('edit')
    let release!: () => void
    const first = workspace.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    await Promise.resolve()
    await Promise.resolve()
    await workspace.run(select, true)
    expect(select).not.toHaveBeenCalled()
    release()
    await first
    finish()
  })

  it('does not open a source after detail loading fails', async () => {
    const { workspace, edit } = harness()
    await workspace.run(async () => false, true)
    expect(edit).not.toHaveBeenCalled()
  })
})
