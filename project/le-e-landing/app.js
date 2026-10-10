const status = document.querySelector('#copy-status')

const installTabs = [...document.querySelectorAll('[data-install-tab]')]
function selectInstallTab(tab) {
  installTabs.forEach((item) => {
    const selected = item === tab
    item.setAttribute('aria-selected', String(selected))
    item.tabIndex = selected ? 0 : -1
    item.classList.toggle('text-white', selected)
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected
  })
}
installTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectInstallTab(tab))
  tab.addEventListener('keydown', (event) => {
    let next
    if (event.key === 'ArrowRight') next = (index + 1) % installTabs.length
    if (event.key === 'ArrowLeft') next = (index + installTabs.length - 1) % installTabs.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = installTabs.length - 1
    if (next === undefined) return
    event.preventDefault()
    selectInstallTab(installTabs[next])
    installTabs[next].focus()
  })
})
if (installTabs.length) selectInstallTab(installTabs[0])

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const command = button.dataset.copy
    if (!command) return

    try {
      await navigator.clipboard.writeText(command)
      button.textContent = '已复制'
      status.textContent = `已复制命令：${command}`
    } catch {
      button.textContent = '复制失败'
      status.textContent = '复制失败，请手动选择命令。'
    }

    window.setTimeout(() => {
      button.textContent = '复制'
    }, 1600)
  })
})
