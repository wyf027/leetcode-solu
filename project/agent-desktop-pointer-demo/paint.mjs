import { randomBytes } from 'node:crypto'
import { PNG } from 'pngjs'

export const paintSteps = [
  { tool: '矩形', detail: '勾出徽记外框' },
  { tool: '油漆桶', detail: '填充银灰底色' },
  { tool: '多边形', detail: '构建紫色头盔和眼部' },
  { tool: '直线', detail: '切出面甲与装甲棱线' },
  { tool: '画刷', detail: '添加金属高光' },
  { tool: '铅笔', detail: '刻画细小装甲接缝' },
  { tool: '椭圆', detail: '绘制徽记铆钉' },
  { tool: '曲线', detail: '绘制下方弧形装饰' },
  { tool: '喷枪', detail: '喷绘两侧能量光晕' },
  { tool: '橡皮', detail: '擦出下颌高光' },
]

const tools = {
  eraser: [15, 57], fill: [39, 57], pencil: [15, 107], brush: [39, 107],
  airbrush: [15, 132], line: [15, 157], curve: [39, 157],
  rectangle: [15, 182], polygon: [39, 182], ellipse: [15, 207],
}
const colors = {
  purple: { column: 7, light: false, rgb: [128, 0, 128] },
  silver: { column: 1, light: true, rgb: [192, 192, 192] },
  white: { column: 0, light: true, rgb: [255, 255, 255] },
  black: { column: 0, light: false, rgb: [0, 0, 0] },
  lavender: { column: 11, light: true, rgb: [128, 128, 255] },
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class PaintDemo {
  constructor(tool) {
    this.tool = tool
    this.run = null
  }

  report() {
    if (!this.run) return { connected: false, steps: paintSteps }
    const { id, next, failed, stopped, preview } = this.run
    return { connected: true, runId: id, next, failed, stopped, preview, steps: paintSteps }
  }

  stop() {
    if (this.run) this.run.stopped = true
    return this.report()
  }

  async call(name, args = {}) {
    if (this.run?.stopped) throw new Error('绘画已停止')
    return this.tool(name, { session: this.run.session, ...args })
  }

  async snapshot() {
    const result = await this.call('get_window_state', {
      pid: this.run.pid, window_id: this.run.windowId,
      tree_format: 'elements', max_elements: 180,
    })
    const data = result.structuredContent
    const elements = data?.elements ?? []
    const address = elements.find((el) => el.role === 'AXTextField' && String(el.value ?? '').includes(this.run.url))
    const menu = elements.find((el) => el.in_web_content && el.role === 'AXMenuBar' && el.label === 'Application Menu')
    const web = elements.find((el) => el.role === 'AXWebArea' && /paint/i.test(el.label))
    if (!address || !web?.frame || !data.window_bounds) {
      throw new Error('Safari 当前页面不是这次绘画的 JS Paint，请重新连接画图')
    }
    if (!menu?.frame) throw new Error('JS Paint 画图工具仍在加载')
    if (web.frame.w < 800 || web.frame.h < 540) throw new Error('请扩大 Safari 画图窗口后重新连接')
    this.run.geometry = {
      bounds: data.window_bounds, content: web.frame,
      width: data.screenshot_width, height: data.screenshot_height,
    }
    const image = result.content?.find((part) => part.type === 'image')
    if (image) this.run.preview = `data:${image.mimeType};base64,${image.data}`
    return data
  }

  async connect() {
    if (this.run && !this.run.failed && !this.run.stopped && this.run.next < paintSteps.length) {
      try {
        await this.snapshot()
        return this.report()
      } catch {
        this.run.failed = true
      }
    }
    if (this.run) await this.tool('end_session', { session: this.run.session })
    const id = randomBytes(8).toString('hex')
    this.run = {
      id, session: 'web-paint-' + id, next: 0, stopped: false, failed: true,
      url: 'https://jspaint.app/#local:decepticon-' + id,
    }
    await this.call('start_session', {
      cursor_theme: { theme_id: 'cua.default', reduced_motion: 'off' },
      cursor_motion: { timing: 'fixed', glide_duration_ms: 220, idle_hide_ms: 60000, effects: { glow: 'on', ripple: 'on' } },
    })
    await this.call('set_agent_cursor_enabled', { enabled: true })
    const launched = await this.call('launch_app', {
      bundle_id: 'com.apple.Safari', creates_new_application_instance: true, urls: [this.run.url],
    })
    this.run.pid = launched.structuredContent?.pid
    if (!this.run.pid) throw new Error('Safari 没有返回应用进程')
    for (let attempt = 0; attempt < 90; attempt++) {
      const result = await this.call('list_windows', { pid: this.run.pid })
      const window = result.structuredContent?.windows?.find((w) => /paint/i.test(w.title ?? ''))
      if (window) {
        this.run.windowId = window.window_id
        try {
          await this.snapshot()
          await this.call('bring_to_front', { pid: this.run.pid, window_id: this.run.windowId })
          // Let JS Paint finish loading its classic toolbar icons and palette.
          await pause(1300)
          await this.snapshot()
          await this.prepareCanvas()
          this.run.failed = false
          return this.report()
        } catch (error) {
          if (attempt === 89 || this.run.stopped) throw error
        }
      }
      await pause(500)
    }
    throw new Error('Safari 画图页面加载超时，请重新连接')
  }

  async prepareCanvas() {
    await this.call('hotkey', {
      pid: this.run.pid, window_id: this.run.windowId,
      keys: ['ctrl', 'e'], delivery_mode: 'background',
    })
    const data = await this.snapshot()
    const buttons = data.elements.filter((el) => el.in_web_content && el.role === 'AXButton')
    const defaults = buttons.find((el) => el.label === 'Default')
    const confirm = buttons.find((el) => el.label === 'OK')
    if (!defaults || !confirm) throw new Error('JS Paint 画布属性未打开，请重新连接')
    await this.call('click', { element_token: defaults.element_token })
    await this.call('click', { element_token: confirm.element_token })
    await this.snapshot()
  }

  screenPoint(x, y) {
    const { bounds, content, width, height } = this.run.geometry
    return {
      x: (content.x - bounds.x + x) * width / bounds.width,
      y: (content.y - bounds.y + y) * height / bounds.height,
    }
  }

  async move(x, y) {
    const { content } = this.run.geometry
    await this.call('move_cursor', { x: content.x + x, y: content.y + y })
  }

  async click(x, y) {
    await this.move(x, y)
    const point = this.screenPoint(x, y)
    // JS Paint handles pointerdown on its palette and canvas. An AXPress
    // only emits click in Safari, so deliver a stationary pointer gesture.
    const result = await this.call('drag', {
      pid: this.run.pid, window_id: this.run.windowId,
      from_x: point.x, from_y: point.y, to_x: point.x, to_y: point.y,
      duration_ms: 80, steps: 1, delivery_mode: 'background',
    })
    if (result.structuredContent?.effect === 'refused') throw new Error('Safari 拒绝了这次点击')
  }

  async select(name) {
    await this.click(...tools[name])
  }

  async color(name) {
    const color = colors[name]
    const { content } = this.run.geometry
    await this.click(42 + color.column * 16, content.h - (color.light ? 39 : 55))
    // WebKit can acknowledge input before the next painted frame arrives.
    // Observe the foreground swatch instead of repeating an uncertain click.
    for (let attempt = 0; attempt < 6; attempt++) {
      await pause(180)
      await this.snapshot()
      const frame = PNG.sync.read(Buffer.from(this.run.preview.split(',')[1], 'base64'))
      const point = this.screenPoint(11, this.run.geometry.content.h - 51)
      const offset = (Math.round(point.y) * frame.width + Math.round(point.x)) * 4
      if (color.rgb.every((value, channel) => Math.abs(value - frame.data[offset + channel]) < 20)) return
    }
    throw new Error('Safari 尚未确认调色板颜色，绘画已停止，请重新连接')
  }

  async canvasClick(x, y) {
    await this.click(x + 60, y + 24)
  }

  async drag(x1, y1, x2, y2, duration = 480) {
    await this.move(x1 + 60, y1 + 24)
    const from = this.screenPoint(x1 + 60, y1 + 24)
    const to = this.screenPoint(x2 + 60, y2 + 24)
    const result = await this.call('drag', {
      pid: this.run.pid, window_id: this.run.windowId,
      from_x: from.x, from_y: from.y, to_x: to.x, to_y: to.y,
      duration_ms: duration, steps: 24, delivery_mode: 'background',
    })
    if (result.structuredContent?.effect === 'refused') throw new Error('Safari 拒绝了这次画布拖拽')
  }

  async polygon(points) {
    await this.drag(...points[0], ...points[1])
    for (const point of points.slice(2)) await this.canvasClick(...point)
    await this.canvasClick(...points[0])
  }

  async step(index, runId) {
    if (!this.run || this.run.id !== runId) throw new Error('请先连接 Safari 画图')
    if (this.run.failed) throw new Error('上次绘画中断，请重新连接以打开空白画布')
    if (index !== this.run.next || index >= paintSteps.length) throw new Error('绘画步骤不连续，请重新连接')
    try {
      await this.snapshot()
      await this.drawStep(index)
      await this.snapshot()
      this.run.next++
      return this.report()
    } catch (error) {
      this.run.failed = true
      throw error
    }
  }

  async drawStep(index) {
    switch (index) {
      case 0:
        await this.select('rectangle')
        await this.click(26, 234)
        await this.color('purple')
        await this.drag(88, 20, 600, 365)
        break
      case 1:
        await this.select('fill')
        await this.color('silver')
        await this.canvasClick(100, 30)
        break
      case 2:
        await this.select('polygon')
        await this.click(26, 278)
        await this.color('purple')
        await this.polygon([
          [168, 48], [277, 82], [312, 140], [329, 87], [344, 67], [359, 87], [376, 140],
          [411, 82], [520, 48], [498, 162], [464, 224], [409, 276], [344, 329],
          [279, 276], [224, 224], [190, 162],
        ])
        await this.color('silver')
        await this.polygon([[210, 158], [309, 190], [288, 210], [235, 182]])
        await this.polygon([[478, 158], [379, 190], [400, 210], [453, 182]])
        break
      case 3:
        await this.select('line')
        await this.color('silver')
        await this.drag(344, 177, 344, 307)
        await this.drag(240, 221, 323, 261)
        await this.drag(448, 221, 365, 261)
        await this.drag(290, 92, 317, 156)
        await this.drag(398, 92, 371, 156)
        break
      case 4:
        await this.select('brush')
        await this.color('white')
        await this.drag(196, 86, 211, 139)
        await this.drag(492, 86, 477, 139)
        break
      case 5:
        await this.select('pencil')
        await this.color('black')
        await this.drag(272, 244, 318, 287)
        await this.drag(416, 244, 370, 287)
        break
      case 6:
        await this.select('ellipse')
        await this.click(26, 234)
        await this.color('purple')
        await this.drag(106, 38, 120, 52)
        await this.drag(568, 38, 582, 52)
        break
      case 7:
        await this.select('curve')
        await this.color('purple')
        await this.drag(245, 337, 443, 337)
        await this.canvasClick(285, 356)
        await this.canvasClick(403, 356)
        break
      case 8:
        await this.select('airbrush')
        await this.color('lavender')
        await this.drag(140, 280, 143, 312, 850)
        await this.drag(548, 280, 545, 312, 850)
        break
      case 9:
        await this.select('eraser')
        await this.drag(334, 285, 354, 285)
        break
    }
  }
}
