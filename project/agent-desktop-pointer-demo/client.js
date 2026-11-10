const stage = document.querySelector('#stage')
const status = document.querySelector('#status')
const connect = document.querySelector('#connect')
const refresh = document.querySelector('#refresh')
const disconnect = document.querySelector('#disconnect')
const presetButtons = document.querySelectorAll('#presets button')
const paintConnect = document.querySelector('#paint-connect')
const paintStart = document.querySelector('#paint-start')
const paintStop = document.querySelector('#paint-stop')
const paintStatus = document.querySelector('#paint-status')
const paintProgress = document.querySelector('#paint-progress')
const paintTools = document.querySelector('#paint-tools')
const paintPreview = document.querySelector('#paint-preview')
const paintCaption = document.querySelector('#paint-caption')
const token = document.querySelector('meta[name=pointer-token]').content
const presets = {
  multiply: ['Two', 'Three', 'Multiply', 'One', 'Seven'],
  divide: ['One', 'Four', 'Four', 'Divide', 'One', 'Two'],
  add: ['One', 'Eight', 'Add', 'Two', 'Four'],
}
let connected = false
let busy = false
let playing = false
let paintBusy = false
let paintRunning = false
let paintCancelled = false
let paintRunId
let paintingSteps = []
let pendingMove
let moving = false
let lastMove = 0
const clicks = []

async function api(action, body = {}) {
  const response = await fetch('/api/' + action, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-pointer-token': token },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  return data
}

function render(panel) {
  stage.style.aspectRatio = panel.bounds.width + '/' + panel.bounds.height
  const readout = document.createElement('div')
  readout.id = 'readout'
  const expression = document.createElement('span')
  expression.textContent = panel.expression
  const result = document.createElement('strong')
  result.textContent = panel.display
  readout.append(expression, result)
  stage.replaceChildren(readout)
  for (const key of panel.keys) {
    const button = document.createElement('button')
    button.className = 'key'
    button.textContent = key.label
    button.dataset.keyId = key.id
    button.disabled = playing
    button.setAttribute('aria-label', key.label)
    button.style.left = key.x * 100 + '%'
    button.style.top = key.y * 100 + '%'
    button.style.width = key.w * 100 + '%'
    button.style.height = key.h * 100 + '%'
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const point = event.detail ? position(event) : { x: key.x + key.w / 2, y: key.y + key.h / 2 }
      if (!point || !connected || playing || paintBusy) return
      if (clicks.length >= 12) {
        status.textContent = '还有按键正在处理，请稍等。'
        return
      }
      clicks.push(point)
      void nextClick()
    })
    stage.append(button)
  }
}

async function update(action, body) {
  if (busy) return
  busy = true
  syncButtons()
  try {
    const result = await api(action, body)
    connected = action !== 'disconnect'
    if (connected) render(result)
    else stage.replaceChildren()
    status.textContent = connected ? '已连接。移动鼠标或点击计算器按键。' : '已断开。'
  } catch (error) {
    if (action === 'click') clicks.length = 0
    status.textContent = error.message
  } finally {
    busy = false
    syncButtons()
    void nextClick()
  }
}

async function nextClick() {
  if (connected && !busy && clicks.length) await update('click', clicks.shift())
}

function syncButtons() {
  connect.disabled = busy || connected
  refresh.disabled = disconnect.disabled = busy || !connected
  for (const button of presetButtons) button.disabled = busy || !connected
  paintConnect.disabled = busy
  paintStart.disabled = busy || !paintRunId
  paintStop.disabled = !paintRunning || paintCancelled
  for (const key of stage.querySelectorAll('.key')) key.disabled = playing || paintBusy
}

async function playPreset(button) {
  if (!connected || busy) return
  const sequence = ['AllClear', ...presets[button.dataset.preset], 'Equals']
  const expression = button.textContent
  busy = playing = true
  pendingMove = undefined
  syncButtons()
  let panel
  try {
    for (const [index, keyId] of sequence.entries()) {
      const keys = [...stage.querySelectorAll('.key')]
      const key = keys.find((entry) => entry.dataset.keyId === keyId
        || (keyId === 'AllClear' && entry.dataset.keyId === 'Clear'))
      for (const entry of keys) {
        entry.disabled = true
        entry.classList.toggle('is-step', entry === key)
      }
      const label = keyId === 'AllClear' ? '清零' : (key?.textContent ?? keyId)
      status.textContent = `${expression} · 第 ${index + 1}/${sequence.length} 步 · ${label}`
      panel = await api('preset-step', { keyId })
      render(panel)
      stage.querySelector(`[data-key-id="${keyId}"]`)?.classList.add('is-step')
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    status.textContent = `演示完成 · ${expression} = ${panel.display}`
  } catch (error) {
    status.textContent = `演示已停止 · ${error.message}`
  } finally {
    pendingMove = undefined
    busy = playing = false
    for (const key of stage.querySelectorAll('.key')) {
      key.disabled = false
      key.classList.remove('is-step')
    }
    syncButtons()
  }
}

function position(event) {
  const rect = stage.getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width
  const y = (event.clientY - rect.top) / rect.height
  if (x >= 0 && x < 1 && y >= 0 && y < 1) return { x, y }
}

stage.addEventListener('pointermove', (event) => {
  if (!playing) pendingMove = position(event)
})
stage.addEventListener('pointerleave', () => { pendingMove = undefined })
async function moveFrame(now) {
  requestAnimationFrame(moveFrame)
  if (!connected || busy || moving || !pendingMove || now - lastMove < 40) return
  const point = pendingMove
  pendingMove = undefined
  lastMove = now
  moving = true
  try {
    await api('move', point)
  } catch (error) {
    status.textContent = error.message
  } finally {
    moving = false
  }
}
requestAnimationFrame(moveFrame)
connect.addEventListener('click', () => update('connect'))
refresh.addEventListener('click', () => update('refresh'))
disconnect.addEventListener('click', () => update('disconnect'))
for (const button of presetButtons) button.addEventListener('click', () => playPreset(button))

function renderPainting(result) {
  paintRunId = result.runId
  paintingSteps = result.steps
  paintProgress.value = result.next
  paintTools.replaceChildren()
  for (const [index, step] of paintingSteps.entries()) {
    const entry = document.createElement('li')
    entry.textContent = `${index + 1}. ${step.tool}`
    entry.classList.toggle('done', index < result.next)
    entry.classList.toggle('current', paintRunning && index === result.next)
    paintTools.append(entry)
  }
  if (result.preview) {
    paintPreview.src = result.preview
    paintPreview.hidden = false
    paintCaption.textContent = `Safari 画布 · 已完成 ${result.next}/10 种工具`
  }
}

paintConnect.addEventListener('click', async () => {
  if (busy) return
  busy = paintBusy = true
  pendingMove = undefined
  paintRunId = undefined
  syncButtons()
  paintStatus.textContent = '正在打开 Safari 画图并准备空白画布…'
  try {
    renderPainting(await api('paint-connect'))
    paintStatus.textContent = '画布已连接，点击「绘制霸天虎」开始。'
  } catch (error) {
    paintStatus.textContent = error.message
  } finally {
    busy = paintBusy = false
    syncButtons()
  }
})

paintStart.addEventListener('click', async () => {
  if (busy || !paintRunId) return
  busy = paintBusy = paintRunning = true
  paintCancelled = false
  pendingMove = undefined
  clicks.length = 0
  syncButtons()
  try {
    for (let index = paintProgress.value; index < paintingSteps.length; index++) {
      if (paintCancelled) break
      const step = paintingSteps[index]
      paintTools.children[index]?.classList.add('current')
      paintStatus.textContent = `第 ${index + 1}/10 种工具 · ${step.tool} · ${step.detail}`
      renderPainting(await api('paint-step', { index, runId: paintRunId }))
    }
    paintStatus.textContent = paintCancelled
      ? '绘画已停止，重新连接可打开新的空白画布。'
      : '绘画完成 · 十种工具已依次操作，可在 Safari 查看与保存画作。'
  } catch (error) {
    paintStatus.textContent = paintCancelled
      ? '绘画已停止，重新连接可打开新的空白画布。'
      : `绘画已停止 · ${error.message}`
  } finally {
    paintRunId = undefined
    pendingMove = undefined
    busy = paintBusy = paintRunning = false
    syncButtons()
  }
})

paintStop.addEventListener('click', async () => {
  if (!paintRunning) return
  paintCancelled = true
  syncButtons()
  paintStatus.textContent = '正在停止，等待当前动作结束…'
  try {
    await api('paint-stop')
  } catch (error) {
    paintStatus.textContent = error.message
  }
})
