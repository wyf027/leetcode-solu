import type { createStdinDriver } from '@simon_he/vue-tui/cli'

type StdinDriverOptions = Parameters<typeof createStdinDriver>[0]

export type TerminalInputEvent = Parameters<StdinDriverOptions['dispatch']>[0]
export type TerminalInputHandler = (event: TerminalInputEvent) => boolean

export interface TerminalInputBus {
  dispatch(event: TerminalInputEvent): boolean
  setHandler(handler: TerminalInputHandler): () => void
}

export function createTerminalInputBus(): TerminalInputBus {
  let currentHandler: TerminalInputHandler | null = null

  return {
    dispatch(event) {
      return currentHandler?.(event) ?? false
    },
    setHandler(handler) {
      currentHandler = handler
      return () => {
        if (currentHandler === handler) currentHandler = null
      }
    },
  }
}
