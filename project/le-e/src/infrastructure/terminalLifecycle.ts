export interface TerminalRendererHandle {
  forceRender(): void
  dispose(): void
}

export interface TerminalDriverHandle {
  dispose(): void
}

export interface TerminalCleanupHandle {
  cleanup(): void
  uninstall(): void
}

export interface TerminalLifecycleDependencies {
  mountApp(): void
  disposeApp(): void
  flush(): void
  createRenderer(): TerminalRendererHandle
  createDriver(): TerminalDriverHandle
  installCleanup(cleanup: () => void): TerminalCleanupHandle
}

export interface TerminalLifecycle {
  mount(): void
  suspend(): void
  resume(): void
  forceRender(): void
  dispose(): void
  isActive(): boolean
  isDisposed(): boolean
}

export function createTerminalLifecycle(
  dependencies: TerminalLifecycleDependencies,
): TerminalLifecycle {
  let renderer: TerminalRendererHandle | undefined
  let driver: TerminalDriverHandle | undefined
  let cleanupHandle: TerminalCleanupHandle | undefined
  let mounted = false
  let active = false
  let disposed = false

  const detachTerminal = () => {
    driver?.dispose()
    driver = undefined
    renderer?.dispose()
    renderer = undefined
    active = false
  }

  const attachTerminal = () => {
    let nextRenderer: TerminalRendererHandle | undefined

    try {
      nextRenderer = dependencies.createRenderer()
      const nextDriver = dependencies.createDriver()
      renderer = nextRenderer
      driver = nextDriver
      active = true
      dependencies.flush()
      renderer.forceRender()
    } catch (error) {
      nextRenderer?.dispose()
      throw error
    }
  }

  const dispose = () => {
    if (disposed) return

    disposed = true
    cleanupHandle?.uninstall()
    cleanupHandle = undefined
    detachTerminal()

    if (mounted) {
      dependencies.disposeApp()
      mounted = false
    }
  }

  return {
    mount() {
      if (disposed) throw new Error('Terminal lifecycle has been disposed')
      if (mounted) return

      dependencies.mountApp()
      mounted = true

      try {
        attachTerminal()
        cleanupHandle = dependencies.installCleanup(dispose)
      } catch (error) {
        dispose()
        throw error
      }
    },

    suspend() {
      if (!active || disposed) return
      detachTerminal()
    },

    resume() {
      if (disposed) throw new Error('Terminal lifecycle has been disposed')
      if (!mounted) throw new Error('Terminal lifecycle has not been mounted')
      if (active) return
      attachTerminal()
    },

    forceRender() {
      if (!active || disposed) return
      dependencies.flush()
      renderer?.forceRender()
    },

    dispose,

    isActive() {
      return active
    },

    isDisposed() {
      return disposed
    },
  }
}
