import { describe, expect, it, vi } from 'vitest'

import { createTerminalLifecycle } from '../../src/infrastructure/terminalLifecycle'

describe('createTerminalLifecycle', () => {
  it('mounts, suspends for an editor, resumes, and disposes in order', () => {
    const events: string[] = []
    let rendererNumber = 0
    let driverNumber = 0
    const uninstall = vi.fn(() => events.push('cleanup:uninstall'))
    const lifecycle = createTerminalLifecycle({
      mountApp: () => events.push('app:mount'),
      disposeApp: () => events.push('app:dispose'),
      flush: () => events.push('app:flush'),
      createRenderer: () => {
        const id = ++rendererNumber
        events.push(`renderer:${id}:create`)
        return {
          forceRender: () => events.push(`renderer:${id}:force`),
          dispose: () => events.push(`renderer:${id}:dispose`),
        }
      },
      createDriver: () => {
        const id = ++driverNumber
        events.push(`driver:${id}:create`)
        return { dispose: () => events.push(`driver:${id}:dispose`) }
      },
      installCleanup: () => ({ cleanup: vi.fn(), uninstall }),
    })

    lifecycle.mount()
    lifecycle.suspend()
    lifecycle.resume()
    lifecycle.dispose()
    lifecycle.dispose()

    expect(events).toEqual([
      'app:mount',
      'renderer:1:create',
      'driver:1:create',
      'app:flush',
      'renderer:1:force',
      'driver:1:dispose',
      'renderer:1:dispose',
      'renderer:2:create',
      'driver:2:create',
      'app:flush',
      'renderer:2:force',
      'cleanup:uninstall',
      'driver:2:dispose',
      'renderer:2:dispose',
      'app:dispose',
    ])
    expect(lifecycle.isDisposed()).toBe(true)
    expect(uninstall).toHaveBeenCalledTimes(1)
  })

  it('runs the same idempotent disposal through the installed cleanup callback', () => {
    let cleanupCallback: (() => void) | undefined
    const disposeApp = vi.fn()
    const disposeDriver = vi.fn()
    const disposeRenderer = vi.fn()
    const lifecycle = createTerminalLifecycle({
      mountApp: vi.fn(),
      disposeApp,
      flush: vi.fn(),
      createRenderer: () => ({ forceRender: vi.fn(), dispose: disposeRenderer }),
      createDriver: () => ({ dispose: disposeDriver }),
      installCleanup: (cleanup) => {
        cleanupCallback = cleanup
        return { cleanup, uninstall: vi.fn() }
      },
    })

    lifecycle.mount()
    cleanupCallback?.()
    cleanupCallback?.()

    expect(disposeDriver).toHaveBeenCalledTimes(1)
    expect(disposeRenderer).toHaveBeenCalledTimes(1)
    expect(disposeApp).toHaveBeenCalledTimes(1)
  })

  it('cleans up a partially attached renderer when driver creation fails', () => {
    const disposeRenderer = vi.fn()
    const disposeApp = vi.fn()
    const lifecycle = createTerminalLifecycle({
      mountApp: vi.fn(),
      disposeApp,
      flush: vi.fn(),
      createRenderer: () => ({ forceRender: vi.fn(), dispose: disposeRenderer }),
      createDriver: () => {
        throw new Error('stdin unavailable')
      },
      installCleanup: () => ({ cleanup: vi.fn(), uninstall: vi.fn() }),
    })

    expect(() => lifecycle.mount()).toThrow('stdin unavailable')
    expect(disposeRenderer).toHaveBeenCalledOnce()
    expect(disposeApp).toHaveBeenCalledOnce()
    expect(lifecycle.isDisposed()).toBe(true)
  })
})
