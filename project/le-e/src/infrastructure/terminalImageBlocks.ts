import sharp from 'sharp'
import type {
  TuiMarkdownBlock,
  TuiMarkdownGraphicSegment,
  TuiMarkdownInlineSegment,
} from '@simon_he/vue-tui/markdown'

const cache = new Map<string, Promise<readonly TuiMarkdownInlineSegment[]>>()

async function rasterize(
  image: TuiMarkdownGraphicSegment,
  native: boolean,
): Promise<readonly TuiMarkdownInlineSegment[]> {
  const width = Math.max(1, Math.min(160, Math.floor(image.displayWidth ?? 32)))
  const rows = Math.max(1, Math.min(256, Math.floor(image.displayHeight ?? 16)))
  const key = `${native ? 'native' : 'cells'}:${width}:${rows}:${image.base64}`
  const existing = cache.get(key)
  if (existing) return existing
  const work = (async () => {
    const input = Buffer.from(image.base64 ?? '', 'base64')
    if (input.byteLength > 1024 * 1024) throw new Error('Image is too large.')
    if (native) {
      const source = sharp(input, { limitInputPixels: 16_000_000 })
      const metadata = await source.metadata()
      if (!metadata.width || !metadata.height) throw new Error('Image dimensions are unavailable.')
      const segments: TuiMarkdownInlineSegment[] = []
      let outputBytes = 0
      // Whole native images escape the virtual viewport. One-cell PNG strips clip with text rows.
      for (let row = 0; row < rows; row++) {
        const top = Math.min(metadata.height - 1, Math.floor((row * metadata.height) / rows))
        const bottom = Math.max(top + 1, Math.floor(((row + 1) * metadata.height) / rows))
        const png = await source
          .clone()
          .extract({ left: 0, top, width: metadata.width, height: bottom - top })
          .png()
          .toBuffer()
        outputBytes += png.byteLength
        if (outputBytes > 4 * 1024 * 1024) throw new Error('Image strips exceed the output limit.')
        segments.push({
          text: image.alt || '图片',
          graphic: {
            ...image,
            base64: png.toString('base64'),
            mime: 'image/png',
            naturalWidth: metadata.width,
            naturalHeight: bottom - top,
            displayWidth: width,
            displayHeight: 1,
          },
        })
        if (row < rows - 1) segments.push({ text: '', hardBreak: true })
      }
      return segments
    }
    const pixels = await sharp(input, { limitInputPixels: 16_000_000 })
      .flatten({ background: '#ffffff' })
      .toColourspace('srgb')
      .resize(width, rows * 2, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer()
    const color = (x: number, y: number) => {
      const offset = (y * width + x) * 3
      return `#${pixels.subarray(offset, offset + 3).toString('hex')}`
    }
    const segments: TuiMarkdownInlineSegment[] = []
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < width; x++) {
        segments.push({ text: '▀', style: { fg: color(x, y * 2), bg: color(x, y * 2 + 1) } })
      }
      if (y < rows - 1) segments.push({ text: '', hardBreak: true })
    }
    return segments
  })()
  cache.set(key, work)
  while (cache.size > 8) cache.delete(cache.keys().next().value!)
  void work.catch(() => cache.delete(key))
  return work
}

// Native graphics protocols are optional; colored half-block cells work in ordinary terminals.
export async function renderTerminalImageBlocks(
  blocks: readonly TuiMarkdownBlock[],
  native = false,
): Promise<TuiMarkdownBlock[]> {
  return Promise.all(
    blocks.map(async (block) => {
      if (block.type !== 'inline') return block
      const segments = await Promise.all(
        block.segments.map(async (segment) => {
          if (segment.graphic?.kind !== 'image' || !segment.graphic.base64) return [segment]
          try {
            return await rasterize(segment.graphic, native)
          } catch {
            return [{ text: '图片转换失败，请重新加载题目。' }]
          }
        }),
      )
      return { ...block, segments: segments.flat() }
    }),
  )
}
