import { createServer } from 'node:http'
import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import { PaintDemo } from './paint.mjs'

const run = promisify(execFile)
const host = '127.0.0.1'
const port = Number(process.env.PORT || 8766)
const origin = `http://${host}:${port}`
const token = randomBytes(24).toString('hex')
const calculator = 'com.apple.calculator'
const session = 'web-pointer-' + token.slice(0, 8)
const agent = process.env.AGENT_DESKTOP_BIN || 'agent-desktop'
const cua = process.env.CUA_DRIVER_BIN || 'cua-driver'
const pointerGlideMs = 35
const presetGlideMs = 340
const labels = Object.fromEntries(Object.entries({
  Delete: '⌫', AllClear: 'AC', Clear: 'C', Percent: '%', Divide: '÷',
  Seven: '7', Eight: '8', Nine: '9', Multiply: '×', Four: '4', Five: '5',
  Six: '6', Subtract: '−', One: '1', Two: '2', Three: '3', Add: '+',
  Negate: '±', Zero: '0', Decimal: '.', Equals: '=',
}))
const page = (await readFile(new URL('index.html', import.meta.url), 'utf8')).replace('__TOKEN__', token)
const client = await readFile(new URL('client.js', import.meta.url))
let child, ready, nextId = 0, active = false, target, state
let actions = Promise.resolve()
const pending = new Map()
const paint = new PaintDemo(tool)

function rpc(method, params) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Cua Driver 响应超时'))
    }, 8000)
    pending.set(id, (message) => {
      clearTimeout(timeout)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

async function startDriver() {
  child = spawn(cua, ['mcp'], { stdio: ['pipe', 'pipe', 'inherit'] })
  const fail = (error) => {
    for (const finish of pending.values()) finish({ error: { message: error.message } })
    pending.clear()
    active = false
    ready = undefined
    if (paint.run) paint.run.failed = true
  }
  child.once('error', fail)
  child.once('exit', () => fail(new Error('Cua Driver 连接已断开，请重新连接')))
  child.stdin.on('error', fail)
  createInterface({ input: child.stdout }).on('line', (line) => {
    let message
    try { message = JSON.parse(line) } catch { return }
    const finish = pending.get(message.id)
    pending.delete(message.id)
    finish?.(message)
  })
  await rpc('initialize', {
    protocolVersion: '2024-11-05', capabilities: {},
    clientInfo: { name: 'local-calculator-pointer', version: '1.0.0' },
  })
  child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
}

async function tool(name, args = {}) {
  await (ready ??= startDriver())
  const result = await rpc('tools/call', { name, arguments: { session, ...args } })
  if (result.isError) {
    throw new Error(result.content?.find((part) => part.type === 'text')?.text || name + ' 失败')
  }
  return result
}

async function desktop(...args) {
  const { stdout } = await run(agent, args, { timeout: 8000, maxBuffer: 1024 * 1024 })
  const result = JSON.parse(stdout)
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

async function windows() {
  return desktop('list-windows', '--app', calculator)
}

function walk(node, visit) {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

async function readPanel() {
  const window = (await windows()).find((entry) => entry.id === target?.id && entry.pid === target?.pid)
  if (!window || !window.visible || window.minimized) throw new Error('请显示计算器窗口，再重新连接')
  const { tree } = await desktop('snapshot', '--app', calculator, '--window-id', window.id, '--include-bounds', '--compact')
  const bounds = window.bounds
  const keys = []
  const lines = []
  walk(tree, (node) => {
    if (node.role === 'statictext' && node.value) lines.push(node.value.replace(/[\u200e\u200f]/g, ''))
    const id = node.native_id?.value
    const rect = node.bounds
    if (node.role !== 'button' || !Object.hasOwn(labels, id) || !rect) return
    keys.push({
      id, label: labels[id], nativeLabel: node.name,
      x: (rect.x - bounds.x) / bounds.width, y: (rect.y - bounds.y) / bounds.height,
      w: rect.width / bounds.width, h: rect.height / bounds.height,
    })
  })
  if (!keys.length) throw new Error('没有读到计算器按键，请切换到基本模式')
  return { bounds, keys, display: lines.at(-1) ?? '', expression: lines.at(-2) ?? '' }
}

function position(body, panel) {
  const { x, y } = body
  if (![x, y].every((n) => Number.isFinite(n) && n >= 0 && n < 1)) {
    throw new Error('坐标超出操作区')
  }
  return { x: panel.bounds.x + x * panel.bounds.width, y: panel.bounds.y + y * panel.bounds.height }
}

function keyCenter(key) {
  return position({ x: key.x + key.w / 2, y: key.y + key.h / 2 }, state)
}

async function pressKey(key, point) {
  const result = await tool('get_window_state', {
    pid: target.pid, window_id: Number(target.id.slice(2)), include_screenshot: false,
    tree_format: 'elements', max_elements: 70,
  })
  const elements = result.structuredContent?.elements ?? []
  const matches = elements.filter((el) => el.role === 'AXButton' && el.label === key.nativeLabel
    && el.actions?.includes('AXPress') && el.frame && point.x >= el.frame.x && point.x < el.frame.x + el.frame.w
    && point.y >= el.frame.y && point.y < el.frame.y + el.frame.h)
  if (matches.length !== 1) throw new Error('计算器界面刚刚发生变化，请刷新后再点')
  await tool('move_cursor', point)
  await tool('click', { element_token: matches[0].element_token })
}

async function operation(action, body) {
  if (action === 'paint-connect') return paint.connect()
  if (action === 'paint-step') return paint.step(body.index, body.runId)
  if (action === 'connect') {
    if (!active) {
      target = (await windows()).find((entry) => entry.visible && !entry.minimized)
      if (!target) throw new Error('请先打开 macOS 计算器')
      state = await readPanel()
      await tool('start_session', {
        cursor_theme: { theme_id: 'cua.default', reduced_motion: 'off' },
        cursor_motion: { timing: 'fixed', glide_duration_ms: pointerGlideMs, idle_hide_ms: 2500, effects: { ripple: 'on' } },
      })
      await tool('set_agent_cursor_enabled', { enabled: true })
      active = true
    }
    return state
  }
  if (action === 'disconnect') {
    if (active) {
      active = false
      await tool('end_session')
    }
    return { disconnected: true }
  }
  if (!active) throw new Error('请先连接计算器')
  if (action === 'move') {
    await tool('move_cursor', position(body, state))
    return { moved: true }
  }
  state = await readPanel()
  if (action === 'refresh') return state
  const presetStep = action === 'preset-step'
  const key = presetStep
    ? state.keys.find(({ id }) => id === body.keyId || (body.keyId === 'AllClear' && id === 'Clear'))
    : state.keys.find((k) => body.x >= k.x && body.x < k.x + k.w && body.y >= k.y && body.y < k.y + k.h)
  if (presetStep && !key) throw new Error('计算器上没有找到这一步的按键')
  const point = presetStep ? keyCenter(key) : position(body, state)
  if (!key) return state
  if (presetStep) await tool('set_agent_cursor_motion', { glide_duration_ms: presetGlideMs })
  try {
    await pressKey(key, point)
    if (presetStep && body.keyId === 'AllClear' && key.id === 'Clear') {
      // C clears the current entry. AC also clears a pending operator.
      state = await readPanel()
      const allClear = state.keys.find(({ id }) => id === 'AllClear')
      if (!allClear) throw new Error('计算器没有进入全部清除状态')
      await pressKey(allClear, keyCenter(allClear))
    }
  } finally {
    if (presetStep) await tool('set_agent_cursor_motion', { glide_duration_ms: pointerGlideMs })
  }
  state = await readPanel()
  return state
}

const server = createServer(async (request, response) => {
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    response.writeHead(status, {
      'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    })
    response.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
  }
  if (request.headers.host !== `${host}:${port}`) return send(403, { error: '仅允许本机访问' })
  if (request.method === 'GET' && request.url === '/') return send(200, page, 'text/html; charset=utf-8')
  if (request.method === 'GET' && request.url === '/client.js') return send(200, client, 'text/javascript; charset=utf-8')
  const action = request.url?.match(/^\/api\/(connect|disconnect|move|click|refresh|preset-step|paint-connect|paint-step|paint-stop)$/)?.[1]
  if (request.method !== 'POST' || !action) return send(404, { error: '找不到请求' })
  if (request.headers.origin !== origin || request.headers['x-pointer-token'] !== token) {
    return send(403, { error: '请在本机页面中操作' })
  }
  try {
    let raw = ''
    for await (const chunk of request) {
      raw += chunk
      if (raw.length > 1024) return send(413, { error: '请求太大' })
    }
    const body = JSON.parse(raw)
    if (action === 'paint-stop') return send(200, paint.stop())
    const work = actions.then(() => operation(action, body))
    actions = work.catch(() => {})
    send(200, await work)
  } catch (error) {
    send(409, { error: error.message })
  }
})
server.listen(port, host, () => console.log(origin))
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  child?.stdin.end()
  server.close(() => process.exit())
  setTimeout(() => process.exit(), 1000).unref()
})
