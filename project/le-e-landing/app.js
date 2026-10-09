const status = document.querySelector('#copy-status')

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
