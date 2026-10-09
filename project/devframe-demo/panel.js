const tools = {
  inspector: {
    title: '⌕ Devframe Inspector', placeholder: 'Filter functions by name…',
    rows: [
      ['devframe:agent:invoke-tool', 'action'], ['devframe:agent:list-resources', 'query'], ['devframe:agent:list-tools', 'query'],
      ['devframe:open-in-editor', 'action'], ['devframe:rpc:server-state:get', 'query'], ['devframe:rpc:server-state:patch', 'query'],
      ['devframe:streaming:subscribe', 'event'], ['hub:commands:execute', 'action'], ['hub:docks:activate', 'action'], ['hub:messages:add', 'event'],
    ],
  },
  git: {
    title: '⑂ Git', placeholder: 'Filter files, branches or commits…',
    rows: [['M  src/client/runtime.ts', 'modified'], ['A  src/hub/palette.ts', 'added'], ['M  packages/hub/package.json', 'modified'], ['main · 8f3b91a feat: add command palette', 'commit'], ['devframe-demo · ahead 2', 'branch']],
  },
  terminal: {
    title: '›_ Terminals', placeholder: 'Filter terminal sessions…',
    rows: [['pnpm dev', 'running'], ['pnpm typecheck', 'success'], ['vite build --watch', 'running'], ['storybook dev -p 6006', 'stopped']],
  },
  a11y: {
    title: '◎ A11y Inspector', placeholder: 'Filter WCAG findings…',
    rows: [['Elements must meet color contrast thresholds', 'serious'], ['Buttons must have discernible text', 'critical'], ['Heading levels should increase by one', 'moderate'], ['Document has a main landmark', 'passed']],
  },
  assets: {
    title: '▧ Assets', placeholder: 'Filter public assets…',
    rows: [['/logo.svg · 4.2 KB', 'svg'], ['/screenshots/hub-1.png · 985 KB', 'png'], ['/fonts/mono.woff2 · 32 KB', 'font'], ['/manifest.webmanifest · 1.1 KB', 'json']],
  },
}

const rows = document.querySelector('#rows')
const filterInput = document.querySelector('#filterInput')
const toolTitle = document.querySelector('#toolTitle')
const summary = document.querySelector('#summary')
const pickerButton = document.querySelector('#pickerButton')
const selectionCard = document.querySelector('#selectionCard')
const filterBar = document.querySelector('#filterBar')
const previewPanel = document.querySelector('#previewPanel')
let activeTool = 'inspector'
let pickerTimer

const tone = type => ({ action: 'text-orange-400', query: 'text-sky-400', event: 'text-pink-400', modified: 'text-amber-400', added: 'text-emerald-400', running: 'text-emerald-400', success: 'text-emerald-400', serious: 'text-orange-400', critical: 'text-red-400', passed: 'text-emerald-400' }[type] || 'text-violet-400')

function renderRows() {
  const data = tools[activeTool]
  toolTitle.textContent = data.title
  filterInput.placeholder = data.placeholder
  filterInput.value = ''
  rows.innerHTML = data.rows.map(([name, type], index) => `
    <button class="row-item group flex w-full items-center gap-3 border-b border-zinc-100 px-4 py-3 text-left transition hover:bg-emerald-500/5 dark:border-[#1c211e] lg:px-6" data-name="${name.toLowerCase()}">
      <span class="text-zinc-400 transition group-hover:translate-x-0.5">›</span>
      <span class="min-w-0 flex-1 truncate">${name}</span>
      <span class="rounded-full border border-current/20 bg-current/5 px-2 py-0.5 text-[10px] ${tone(type)}">${type}</span>
      <span class="hidden text-[10px] text-zinc-500 sm:block">${index + 1}.${String(index * 7 + 3).padStart(2, '0')}ms</span>
    </button>`).join('')
  const counts = data.rows.reduce((all, [, type]) => (all[type] = (all[type] || 0) + 1, all), {})
  summary.innerHTML = `<span>${data.rows.length} entries</span>` + Object.entries(counts).slice(0, 3).map(([type, count]) => `<span class="rounded-full border border-zinc-200 px-2 dark:border-line"><b class="${tone(type)}">${type}</b> ${count}</span>`).join('')
}

function selectTool(name) {
  activeTool = name
  document.querySelectorAll('.tool-button').forEach(button => button.setAttribute('aria-current', button.dataset.tool === name ? 'page' : 'false'))
  document.querySelector('#mobileTool').value = name
  renderRows()
}

function addMessage(text) {
  const message = document.createElement('div')
  message.className = 'rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-3 py-2'
  const badge = document.createElement('span')
  badge.className = 'text-emerald-500'
  badge.textContent = '[success]'
  message.append(badge, ` ${text}`)
  document.querySelector('#messages').prepend(message)
  document.querySelector('#terminalDigest').textContent = `${text} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function togglePalette(open) {
  const palette = document.querySelector('#palette')
  palette.classList.toggle('hidden', !open)
  palette.classList.toggle('flex', open)
  if (open) document.querySelector('#paletteInput').focus()
}

function evalInspected(expression) {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(expression, (result, exception) => {
      if (exception)
        reject(new Error(exception.value || exception.description || exception.code || 'Unable to inspect this page'))
      else
        resolve(result)
    })
  })
}

function installPicker() {
  window.__DEVFRAME_PICKER__?.stop()
  window.__DEVFRAME_PICKER_RESULT__ = null

  const overlay = document.createElement('div')
  const label = document.createElement('div')
  overlay.setAttribute('data-devframe-picker', '')
  label.setAttribute('data-devframe-picker', '')
  overlay.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #83d8a5;background:#83d8a526;box-shadow:0 0 0 1px #07120b;display:none'
  label.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;padding:4px 7px;border-radius:5px;background:#101310;color:#e8f8ee;font:12px/1.3 ui-monospace,SFMono-Regular,monospace;display:none;max-width:70vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
  document.documentElement.append(overlay, label)
  let current

  const selectorFor = (element) => {
    if (element.id)
      return `#${CSS.escape(element.id)}`
    for (const attr of ['data-testid', 'data-test', 'data-cy']) {
      const value = element.getAttribute(attr)
      if (value)
        return `[${attr}="${CSS.escape(value)}"]`
    }
    const parts = []
    for (let node = element; node?.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      const tag = node.localName
      const siblings = [...node.parentElement.children].filter(sibling => sibling.localName === tag)
      parts.unshift(`${tag}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ''}`)
      if (parts.length === 5 || node.parentElement === document.body)
        break
    }
    return parts.join(' > ')
  }

  const componentFor = (element) => {
    for (let node = element; node; node = node.parentElement) {
      const vue = node.__vueParentComponent
      const vueName = vue?.type?.name || vue?.type?.__name
      if (vueName)
        return { framework: 'Vue', name: vueName }

      const fiberKey = Object.keys(node).find(key => key.startsWith('__reactFiber$'))
      for (let fiber = fiberKey && node[fiberKey]; fiber; fiber = fiber.return) {
        const type = fiber.elementType || fiber.type
        const name = typeof type === 'function' ? type.displayName || type.name : type?.displayName
        if (name)
          return { framework: 'React', name }
      }
    }
    return { framework: 'DOM', name: element.localName }
  }

  const preview = (element) => {
    if (!element || element.hasAttribute?.('data-devframe-picker'))
      return
    current = element
    const rect = element.getBoundingClientRect()
    Object.assign(overlay.style, { display: 'block', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    const component = componentFor(element)
    label.textContent = `${component.framework} · ${component.name}  ${Math.round(rect.width)}×${Math.round(rect.height)}`
    Object.assign(label.style, { display: 'block', left: `${Math.max(4, rect.left)}px`, top: `${Math.max(4, rect.top - 27)}px` })
  }

  const stop = () => {
    removeEventListener('pointermove', onMove, true)
    removeEventListener('click', onClick, true)
    removeEventListener('keydown', onKey, true)
    overlay.remove()
    label.remove()
  }
  const onMove = event => preview(document.elementFromPoint(event.clientX, event.clientY))
  const onClick = (event) => {
    if (!current)
      return
    event.preventDefault()
    event.stopImmediatePropagation()
    const rect = current.getBoundingClientRect()
    const component = componentFor(current)
    window.__DEVFRAME_PICKER_LAST__ = current
    window.__DEVFRAME_PICKER_RESULT__ = {
      selector: selectorFor(current),
      tag: current.localName,
      id: current.id || '',
      classes: [...current.classList].slice(0, 8),
      text: (current.innerText || current.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 180),
      html: current.outerHTML.slice(0, 800),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      ...component,
    }
    stop()
  }
  const onKey = (event) => {
    if (event.key !== 'Escape')
      return
    window.__DEVFRAME_PICKER_RESULT__ = { cancelled: true }
    stop()
  }
  addEventListener('pointermove', onMove, true)
  addEventListener('click', onClick, true)
  addEventListener('keydown', onKey, true)
  window.__DEVFRAME_PICKER__ = { stop }
  return true
}

function setPicking(active) {
  pickerButton.classList.toggle('picker-active', active)
  pickerButton.setAttribute('aria-pressed', String(active))
  pickerButton.textContent = active ? '● Picking…' : '⌖ Select'
}

function showSelection(selection) {
  selectionCard.hidden = false
  document.querySelector('#selectionTitle').textContent = `${selection.framework} · ${selection.name}`
  document.querySelector('#selectionSelector').textContent = selection.selector
  document.querySelector('#selectionMeta').textContent = `↔ ${selection.rect.width} × ${selection.rect.height}   ⌖ ${selection.rect.x}, ${selection.rect.y}`
  document.querySelector('#selectionHtml').textContent = selection.html.split('>')[0] + '>'
  addMessage(`${selection.framework} ${selection.name} selected`)
}

async function togglePicker() {
  if (pickerButton.getAttribute('aria-pressed') === 'true') {
    clearInterval(pickerTimer)
    await evalInspected('window.__DEVFRAME_PICKER__?.stop(); window.__DEVFRAME_PICKER_RESULT__ = { cancelled: true }; true')
    setPicking(false)
    return
  }
  try {
    await evalInspected(`(${installPicker.toString()})()`)
    setPicking(true)
    pickerTimer = setInterval(async () => {
      try {
        const result = await evalInspected('window.__DEVFRAME_PICKER_RESULT__ || null')
        if (!result)
          return
        clearInterval(pickerTimer)
        setPicking(false)
        if (!result.cancelled)
          showSelection(result)
      }
      catch {
        clearInterval(pickerTimer)
        setPicking(false)
      }
    }, 150)
  }
  catch (error) {
    setPicking(false)
    addMessage(error.message)
  }
}

document.querySelector('#toolNav').addEventListener('click', event => {
  const button = event.target.closest('[data-tool]')
  if (button) selectTool(button.dataset.tool)
})
document.querySelector('#mobileTool').addEventListener('change', event => selectTool(event.target.value))
document.querySelector('#tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-tab]')
  if (!button) return
  document.querySelectorAll('.tab-button').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)))
  const preview = button.dataset.tab === 'Preview'
  filterBar.hidden = preview
  rows.hidden = preview
  previewPanel.hidden = !preview
  if (!preview)
    filterInput.placeholder = `Filter ${button.dataset.tab.toLowerCase()}…`
})
filterInput.addEventListener('input', () => {
  const query = filterInput.value.trim().toLowerCase()
  document.querySelectorAll('.row-item').forEach(row => row.hidden = !row.dataset.name.includes(query))
})
document.querySelector('#themeButton').addEventListener('click', () => document.documentElement.classList.toggle('dark'))
pickerButton.addEventListener('click', togglePicker)
document.querySelector('#clearSelectionButton').addEventListener('click', () => { selectionCard.hidden = true })
document.querySelector('#openElementsButton').addEventListener('click', () => evalInspected('inspect(window.__DEVFRAME_PICKER_LAST__); true'))
document.querySelector('#refreshButton').addEventListener('click', event => {
  event.currentTarget.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 450 })
  addMessage(`${tools[activeTool].title.replace(/^\S+\s/, '')} refreshed`)
})
document.querySelectorAll('.command, .palette-command').forEach(button => button.addEventListener('click', () => {
  addMessage(`${button.dataset.command} completed`)
  togglePalette(false)
}))
document.querySelector('#paletteButton').addEventListener('click', () => togglePalette(true))
document.querySelector('#palette').addEventListener('click', event => { if (event.target.id === 'palette') togglePalette(false) })
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); togglePalette(true) }
  if (event.key === 'Escape') togglePalette(false)
})

if (globalThis.chrome?.devtools) {
  document.documentElement.classList.toggle('dark', chrome.devtools.panels.themeName === 'dark')
  document.querySelector('#connectionMeta').lastChild.textContent = ` DevTools Panel · tab=${chrome.devtools.inspectedWindow.tabId}`
}
else {
  pickerButton.disabled = true
  pickerButton.title = 'Open this page inside Chrome DevTools to select elements.'
}

renderRows()
console.assert(document.querySelectorAll('.row-item').length === tools.inspector.rows.length, 'Initial devframe rows should render')
console.assert(pickerButton && selectionCard && previewPanel, 'Picker and preview controls should exist')
