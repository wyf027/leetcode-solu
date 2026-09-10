import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
} from '@simon_he/vue-tui/cli'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reactive, watch } from 'vue'

import App from './App.vue'
import { createAppController } from './application/createAppController'
import { createTerminalInputBus } from './application/terminalInput'
import { createAccountFavoritesGateway } from './infrastructure/accountFavoritesGateway'
import { createChineseProblemCatalog } from './infrastructure/chineseProblemCatalog'
import { createLeetCodeGateway } from './infrastructure/leetcodeGateway'
import { createProcessRunner } from './infrastructure/processRunner'
import { createSourceBridgeSession } from './infrastructure/sourceBridgeServer'
import { createSessionTokenStore } from './infrastructure/sessionTokens'
import { loadSourceFile } from './infrastructure/sourceFile'
import { createEmbeddedMicro } from './infrastructure/embeddedMicro'
import { createTerminalLifecycle } from './infrastructure/terminalLifecycle'
import type { TerminalLifecycle } from './infrastructure/terminalLifecycle'

export interface RunTerminalAppOptions {
  readonly cliCommand?: string
  readonly accountHelperCommand?: string
  readonly vimCommand?: string
  readonly editorCommand?: string
}

export function runTerminalApp(options: RunTerminalAppOptions = {}): void {
  const screen = reactive({
    cols: process.stdout.columns ?? 100,
    rows: process.stdout.rows ?? 28,
  })
  const inputBus = createTerminalInputBus()
  const editor = createEmbeddedMicro(options.editorCommand ?? options.vimCommand)
  const sessionTokens = createSessionTokenStore()
  const controller = createAppController({
    gateway: createLeetCodeGateway({
      runner: createProcessRunner(),
      ...(options.cliCommand === undefined ? {} : { command: options.cliCommand }),
      ...(options.cliCommand === undefined
        ? { chineseCatalog: createChineseProblemCatalog() }
        : {}),
      sessionTokens,
    }),
    favoritesGateway: createAccountFavoritesGateway({
      runner: createProcessRunner(),
      command:
        options.accountHelperCommand ??
        resolve('work/clearloop-leetcode-cli-v0.5.4/target/release/le-e-account'),
      sessionTokens,
    }),
    editorBridge: {
      createBridge: createSourceBridgeSession,
      loadSource: loadSourceFile,
    },
    vimEditor: editor,
    suspendForEditor: () => {},
    resumeAfterEditor: () => {},
  })

  let removeResizeListener: (() => void) | undefined
  let stopped = false
  let pointerShape = 'default'
  const setPointerShape = (shape: 'default' | 'ew-resize' | 'ns-resize'): void => {
    if (shape === pointerShape) return
    pointerShape = shape
    // OSC 22 is ignored by terminals without pointer-shape support; App also draws an arrow.
    if (process.stdout.isTTY) process.stdout.write(`\x1b]22;${shape}\x1b\\`)
  }

  const requestExit = (): void => {
    if (stopped) return
    stopped = true
    controller.dispose()
    editor.dispose()
    lifecycle.dispose()
    process.exitCode = 0
  }

  const app = createTerminalApp({
    cols: screen.cols,
    rows: screen.rows,
    component: App,
    props: { controller, screen, inputBus, requestExit, editor, setPointerShape },
    defaultStyle: { fg: 'whiteBright' },
  })

  const lifecycle: TerminalLifecycle = createTerminalLifecycle({
    mountApp() {
      app.mount()
      removeResizeListener = app.terminal.on('resize', ({ cols, rows }) => {
        screen.cols = cols
        screen.rows = rows
      })
    },
    disposeApp() {
      setPointerShape('default')
      removeResizeListener?.()
      removeResizeListener = undefined
      app.dispose()
    },
    flush() {
      app.scheduler.flush()
    },
    createRenderer() {
      return createStdoutRenderer(app.terminal, {
        output: process.stdout,
        hideCursor: true,
        altScreen: true,
        clear: true,
        trackResize: true,
        colorMode: 'auto',
      })
    },
    createDriver() {
      process.stdin.ref()
      return createStdinDriver({
        dispatch(event) {
          const handled = inputBus.dispatch(event)
          const prevented = handled || app.events.dispatch(event)
          queueMicrotask(() => lifecycle.forceRender())
          return prevented
        },
        enableMouse: true,
        enableMouseMotion: true,
        onExit: requestExit,
      })
    },
    installCleanup(cleanup) {
      return installTerminalCleanup(
        () => {
          controller.dispose()
          editor.dispose()
          cleanup()
        },
        {
          signalPolicy: 'reraise',
          cleanupOnUnhandledRejection: true,
        },
      )
    },
  })

  watch(
    () => editor.state.revision,
    () => queueMicrotask(() => lifecycle.forceRender()),
  )

  watch(
    controller.state,
    () => {
      queueMicrotask(() => lifecycle.forceRender())
    },
    { deep: true, flush: 'post' },
  )

  lifecycle.mount()
  void controller.start().finally(() => lifecycle.forceRender())
}

const entryPath = process.argv[1]
if (entryPath !== undefined && resolve(entryPath) === resolve(fileURLToPath(import.meta.url))) {
  runTerminalApp()
}
