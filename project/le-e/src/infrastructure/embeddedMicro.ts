import headless from '@xterm/headless'
import pty from 'node-pty'
import type { IPty } from 'node-pty'
import { delimiter, dirname, join, resolve } from 'node:path'
import { constants } from 'node:fs'
import { access, stat, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { reactive } from 'vue'
import { env as processEnvironment } from 'node:process'

import type { TerminalInputEvent } from '../application/terminalInput'

async function resolveEditorCommand(command: string): Promise<string> {
  const candidates = command.includes('/')
    ? [resolve(command)]
    : [
        ...(processEnvironment.PATH ?? '')
          .split(delimiter)
          .filter(Boolean)
          .map((directory) => resolve(directory, command)),
        ...(command === 'micro' && process.platform === 'darwin'
          ? ['/opt/homebrew/bin/micro', '/usr/local/bin/micro']
          : []),
      ]
  for (const path of new Set(candidates)) {
    try {
      await access(path, constants.X_OK)
      if ((await stat(path)).isFile()) return path
    } catch {
      /* Try the next executable location. */
    }
  }
  throw new Error('找不到可执行的 Micro；请安装 micro（macOS: brew install micro）。')
}

// A private per-session plugin acknowledges an actual buffer save, not a keypress.
const SAVE_PLUGIN = `
local config = import("micro/config")
local micro = import("micro")
function init()
    local bound, err = config.TryBindKey("F8", "lua:initlua.save", true)
    if not bound or err ~= nil then return end
    local ready = io.open(config.ConfigDir .. "/save-ready", "w")
    if ready ~= nil then ready:write("ready"); ready:close() end
end
function save(bp)
    local request = io.open(config.ConfigDir .. "/save-request", "r")
    if request == nil then return false end
    local id = request:read("*l")
    local action = request:read("*l")
    request:close()
    if id == nil or not id:match("^[%w%-]+$") then return false end
    local ok = false
    if bp.Buf.AbsPath == os.getenv("LE_E_SOURCE_PATH") then
        ok = bp.Buf:Save() == nil
    end
    local reply = io.open(config.ConfigDir .. "/" .. id, "w")
    if reply == nil then return false end
    reply:write(ok and "saved" or "failed")
    reply:close()
    if ok and action == "close" then bp:Quit() end
    if not ok then micro.InfoBar():Error("Source save failed; operation cancelled.") end
    return ok
end
`

export function createEmbeddedMicro(command = 'micro') {
  const terminal = new headless.Terminal({
    cols: 50,
    rows: 15,
    scrollback: 0,
    allowProposedApi: true,
  })
  const state = reactive({
    active: false,
    revision: 0,
    path: '',
    cursorVisible: true,
    saving: false,
    error: '',
  })
  let configDirectory: string | undefined
  let preserveRecovery = false
  const cleanConfig = async () => {
    const directory = configDirectory
    if (!directory || preserveRecovery || state.saving || child) return
    configDirectory = undefined
    await rm(directory, { recursive: true, force: true })
  }
  for (const final of ['h', 'l']) {
    terminal.parser.registerCsiHandler({ prefix: '?', final }, (params) => {
      if (params.includes(25)) state.cursorVisible = final === 'h'
      return false
    })
  }
  let child: IPty | undefined
  let killTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const parsed = terminal.onWriteParsed(() => {
    state.revision++
  })
  const replies = terminal.onData((data) => child?.write(data))

  const stop = () => {
    const process = child
    if (!process || killTimer) return
    // A forced shutdown can leave unsaved Micro backups; keep those recoverable.
    preserveRecovery = true
    process.kill('SIGHUP')
    killTimer = setTimeout(() => {
      if (child === process) process.kill('SIGKILL')
    }, 2_000)
    killTimer.unref()
  }

  return {
    state,
    terminal,
    async open(path: string, { signal }: { signal: AbortSignal }): Promise<void> {
      signal.throwIfAborted()
      if (disposed) throw new Error('Micro has been disposed.')
      if (child) throw new Error('Micro is already open.')
      const executable = await resolveEditorCommand(command)
      await cleanConfig()
      preserveRecovery = false
      configDirectory = await mkdtemp(join(tmpdir(), 'le-e-micro-'))
      try {
        await writeFile(join(configDirectory, 'init.lua'), SAVE_PLUGIN, { mode: 0o600 })
        terminal.reset()
        state.cursorVisible = true
        state.error = ''
        // Credentials are only needed by the CLI, not by the editor or its child shell.
        const environment: NodeJS.ProcessEnv = {
          TERM: 'xterm-256color',
          MICRO_CONFIG_HOME: configDirectory,
          LE_E_SOURCE_PATH: path,
        }
        for (const [key, value] of Object.entries(processEnvironment)) {
          if (
            /^(?:PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TMP|TEMP|LANG|LANGUAGE|LC_[A-Z_]+|TZ|TERMINFO|TERMINFO_DIRS|COLORTERM|__CF_USER_TEXT_ENCODING)$/.test(
              key,
            ) &&
            value !== undefined
          ) {
            environment[key] = value
          }
        }
        signal.throwIfAborted()
        if (disposed) throw new Error('Micro has been disposed.')
        const processHandle = pty.spawn(executable, ['-config-dir', configDirectory, '--', path], {
          name: 'xterm-256color',
          cols: terminal.cols,
          rows: terminal.rows,
          cwd: dirname(path),
          env: environment,
        })
        child = processHandle
        state.path = path
        state.active = true
        await new Promise<void>((resolve, reject) => {
          const data = processHandle.onData((chunk) => {
            if (!disposed) terminal.write(chunk)
          })
          const exited = processHandle.onExit(({ exitCode, signal: exitSignal }) => {
            data.dispose()
            exited.dispose()
            signal.removeEventListener('abort', stop)
            clearTimeout(killTimer)
            killTimer = undefined
            child = undefined
            state.active = false
            state.revision++
            if (signal.aborted) reject(new Error('Micro was cancelled.'))
            else if (exitCode !== 0 || exitSignal)
              reject(
                new Error(
                  `Micro 异常退出（exit=${exitCode}, signal=${exitSignal ?? 0}）。启动程序：${executable}`,
                ),
              )
            else resolve()
          })
          signal.addEventListener('abort', stop, { once: true })
          if (signal.aborted) stop()
        })
      } finally {
        await cleanConfig()
      }
    },
    async save(close = false): Promise<boolean> {
      if (!child || !configDirectory || state.saving) return false
      const directory = configDirectory
      const processHandle = child
      const id = randomUUID()
      state.saving = true
      state.error = ''
      try {
        let ready = ''
        const readyDeadline = Date.now() + 3_000
        while (Date.now() < readyDeadline && child === processHandle) {
          ready = await readFile(join(directory, 'save-ready'), 'utf8').catch(() => '')
          if (ready === 'ready') break
          await delay(50)
        }
        if (ready !== 'ready')
          throw new Error('Micro 保存桥接未就绪。请先 Ctrl+S 保存、Ctrl+Q 退出，再按 e 重新打开。')
        await writeFile(join(directory, 'save-request'), `${id}\n${close ? 'close' : 'save'}\n`, {
          mode: 0o600,
        })
        if (child !== processHandle) throw new Error('Micro closed before saving.')
        processHandle.write('\x1b[19~')
        const deadline = Date.now() + 5_000
        while (Date.now() < deadline) {
          const reply = await readFile(join(directory, id), 'utf8').catch(() => '')
          if (reply === 'failed') throw new Error('保存失败，请检查编辑器提示；未执行或提交。')
          if (reply === 'saved' && (!close || child !== processHandle)) return true
          await delay(50)
        }
        const reply = await readFile(join(directory, id), 'utf8').catch(() => '')
        throw new Error(
          reply === 'saved'
            ? '代码已保存，但 Micro 尚未退出；请关闭其他标签页或提示后重试。'
            : '保存桥接已加载，但没有收到保存回执；请先关闭 Micro 内的提示后重试。',
        )
      } catch (error) {
        state.error = error instanceof Error ? error.message : '保存失败。'
        return false
      } finally {
        state.saving = false
        await cleanConfig()
      }
    },
    resize(cols: number, rows: number) {
      if (disposed) return
      cols = Math.max(10, Math.floor(cols))
      rows = Math.max(3, Math.floor(rows))
      if (cols === terminal.cols && rows === terminal.rows) return
      terminal.resize(cols, rows)
      child?.resize(cols, rows)
      state.revision++
    },
    input(event: TerminalInputEvent): boolean {
      if (!child) return false
      if (state.saving) return true
      if (event.type === 'paste') {
        const text = (event.text ?? '').replace(/\r?\n/g, '\r')
        child.write(terminal.modes.bracketedPasteMode ? `\x1b[200~${text}\x1b[201~` : text)
        return true
      }
      if (event.type !== 'keydown') return event.type === 'keyup' || event.type === 'input'
      const modifier =
        1 + (event.shiftKey ? 1 : 0) + (event.altKey ? 2 : 0) + (event.ctrlKey ? 4 : 0)
      const cursorKeys: Record<string, string> = {
        ArrowUp: 'A',
        ArrowDown: 'B',
        ArrowRight: 'C',
        ArrowLeft: 'D',
        Home: 'H',
        End: 'F',
      }
      const tildeKeys: Record<string, number> = {
        Insert: 2,
        Delete: 3,
        PageUp: 5,
        PageDown: 6,
        F5: 15,
        F7: 18,
        F8: 19,
        F9: 20,
        F10: 21,
        F11: 23,
        F12: 24,
      }
      let value: string | undefined
      if (event.key in cursorKeys) {
        const prefix = terminal.modes.applicationCursorKeysMode ? '\x1bO' : '\x1b['
        value =
          modifier === 1
            ? `${prefix}${cursorKeys[event.key]}`
            : `\x1b[1;${modifier}${cursorKeys[event.key]}`
      } else if (event.key in tildeKeys) {
        value = `\x1b[${tildeKeys[event.key]}${modifier === 1 ? '' : `;${modifier}`}~`
      } else if (/^F[1-4]$/.test(event.key)) {
        const final = String.fromCharCode(79 + Number(event.key.slice(1)))
        value = modifier === 1 ? `\x1bO${final}` : `\x1b[1;${modifier}${final}`
      } else if (event.key === 'Tab' || event.key === 'BackTab' || event.key === 'ISO_Left_Tab') {
        value = event.shiftKey || event.key !== 'Tab' ? '\x1b[Z' : '\t'
      } else {
        const special: Record<string, string> = { Enter: '\r', Escape: '\x1b', Backspace: '\x7f' }
        value = special[event.key]
        if (value === undefined && [...event.key].length === 1) {
          const char = event.key.toUpperCase().charCodeAt(0)
          value =
            event.ctrlKey && char >= 64 && char <= 95
              ? String.fromCharCode(char & 31)
              : event.ctrlKey && event.key === ' '
                ? '\x00'
                : event.key
        }
        if (value !== undefined && event.altKey) value = `\x1b${value}`
      }
      if (value !== undefined) child.write(value)
      return true
    },
    mouse(event: TerminalInputEvent, x: number, y: number): boolean {
      if (state.saving) return true
      if (!child || !('cellX' in event) || terminal.modes.mouseTrackingMode === 'none') return false
      const col = Math.min(terminal.cols, Math.max(1, event.cellX - x + 1))
      const row = Math.min(terminal.rows, Math.max(1, event.cellY - y + 1))
      let button =
        event.type === 'wheel'
          ? event.deltaY < 0
            ? 64
            : 65
          : 'button' in event
            ? (event.button ?? 0)
            : 0
      if (event.type === 'pointermove') {
        if (
          (event.buttons === undefined ? event.button === 3 : !event.buttons) ||
          terminal.modes.mouseTrackingMode === 'x10' ||
          terminal.modes.mouseTrackingMode === 'vt200'
        )
          return false
        button = 32 + (event.button ?? 0)
      } else if (!['pointerdown', 'pointerup', 'wheel'].includes(event.type)) return false
      button += (event.shiftKey ? 4 : 0) + (event.altKey ? 8 : 0) + (event.ctrlKey ? 16 : 0)
      child.write(`\x1b[<${button};${col};${row}${event.type === 'pointerup' ? 'm' : 'M'}`)
      return true
    },
    dispose() {
      if (disposed) return
      disposed = true
      stop()
      parsed.dispose()
      replies.dispose()
      terminal.dispose()
    },
  }
}

export type EmbeddedMicro = ReturnType<typeof createEmbeddedMicro>
