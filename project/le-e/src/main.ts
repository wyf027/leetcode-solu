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
import { loadSourceFile } from './infrastructure/sourceFile'
import { createTerminalLifecycle } from './infrastructure/terminalLifecycle'
import type { TerminalLifecycle } from './infrastructure/terminalLifecycle'

export interface RunTerminalAppOptions {
  readonly cliCommand?: string
  readonly accountHelperCommand?: string
  readonly vimCommand?: string
}

export function runTerminalApp(options: RunTerminalAppOptions = {}): void {
  const screen = reactive({
    cols: process.stdout.columns ?? 100,
    rows: process.stdout.rows ?? 28,
  })
  const inputBus = createTerminalInputBus()
  const vimEditorRunner = createProcessRunner()
  const controller = createAppController({
    gateway: createLeetCodeGateway({
      runner: createProcessRunner(),
      ...(options.cliCommand === undefined ? {} : { command: options.cliCommand }),
      ...(options.cliCommand === undefined
        ? { chineseCatalog: createChineseProblemCatalog() }
        : {}),
    }),
    favoritesGateway: createAccountFavoritesGateway({
      runner: createProcessRunner(),
      command:
        options.accountHelperCommand ??
        resolve('work/clearloop-leetcode-cli-v0.5.4/target/release/le-e-account'),
    }),
    editorBridge: {
      createBridge: createSourceBridgeSession,
      loadSource: loadSourceFile,
    },
    vimEditor: {
      async open(path, { signal }) {
        const result = await vimEditorRunner.runInherited({
          command: options.vimCommand ?? 'vim',
          args: ['--', path],
          signal,
        })
        if (result.cancelled) throw new Error('Vim was cancelled.')
        if (result.exitCode !== 0) {
          throw new Error(
            `Vim exited with ${result.signal === null ? `code ${result.exitCode ?? 'unknown'}` : `signal ${result.signal}`}.`,
          )
        }
      },
    },
    suspendForEditor: () => lifecycle.suspend(),
    resumeAfterEditor: () => lifecycle.resume(),
  })

  let removeResizeListener: (() => void) | undefined
  let stopped = false

  const requestExit = (): void => {
    if (stopped) return
    stopped = true
    controller.dispose()
    lifecycle.dispose()
    process.exitCode = 0
  }

  const app = createTerminalApp({
    cols: screen.cols,
    rows: screen.rows,
    component: App,
    props: { controller, screen, inputBus, requestExit },
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
        onExit: requestExit,
      })
    },
    installCleanup(cleanup) {
      return installTerminalCleanup(
        () => {
          controller.dispose()
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
