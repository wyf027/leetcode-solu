import { Buffer } from 'node:buffer'

import sharp from 'sharp'

import { sanitizeOutput } from './parsers/outputSanitizer'

const IMAGE_TIMEOUT_MS = 8_000
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_OUTPUT_BYTES = 1024 * 1024
const MAX_IMAGES_PER_STATEMENT = 4
const MAX_IMAGE_CACHE_ENTRIES = 32
const MAX_IMAGE_INPUT_PIXELS = 16_000_000
const MAX_IMAGE_WIDTH = 960
const MAX_IMAGE_HEIGHT = 640
const MAX_REDIRECTS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const ALLOWED_IMAGE_HOSTS = new Set([
  'assets.leetcode.com',
  'assets.leetcode.cn',
  'assets.leetcode-cn.com',
  'pic.leetcode-cn.com',
])
const IMAGE_SIZE_START = '\uE002'
const IMAGE_SIZE_END = '\uE003'

interface LoadedImage {
  readonly dataUri: string
  readonly originalWidth: number
  readonly originalHeight: number
}

const imageCache = new Map<string, LoadedImage>()
let imageConversionQueue: Promise<void> = Promise.resolve()

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(IMAGE_TIMEOUT_MS)
  return signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal])
}

function decodeHtmlEntities(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  return value.replace(/&(#x[\dA-Fa-f]+|#\d+|[A-Za-z]+);/g, (entity, name: string) => {
    if (name.startsWith('#x')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16))
    if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10))
    return named[name] ?? entity
  })
}

function htmlAttribute(tag: string, name: string): string | null {
  const quoted = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(tag)
  if (quoted?.[2] !== undefined) return decodeHtmlEntities(quoted[2])
  const unquoted = new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, 'i').exec(tag)
  return unquoted?.[1] === undefined ? null : decodeHtmlEntities(unquoted[1])
}

function safeImageUrl(source: string): URL | null {
  try {
    const url = new URL(source, 'https://leetcode.cn')
    if (
      url.protocol !== 'https:' ||
      (url.port !== '' && url.port !== '443') ||
      url.username !== '' ||
      url.password !== '' ||
      !ALLOWED_IMAGE_HOSTS.has(url.hostname.toLocaleLowerCase())
    ) {
      return null
    }
    return url
  } catch {
    return null
  }
}

async function readBoundedBody(response: Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    throw new Error('Problem image exceeds the download limit.')
  }
  if (response.body === null) throw new Error('Problem image response was empty.')

  const chunks: Buffer[] = []
  const reader = response.body.getReader()
  let total = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      total += result.value.byteLength
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel()
        throw new Error('Problem image exceeds the download limit.')
      }
      chunks.push(Buffer.from(result.value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, total)
}

function rememberImage(url: string, image: LoadedImage): void {
  imageCache.delete(url)
  imageCache.set(url, image)
  while (imageCache.size > MAX_IMAGE_CACHE_ENTRIES) {
    const oldest = imageCache.keys().next().value
    if (oldest === undefined) break
    imageCache.delete(oldest)
  }
}

async function raceWithSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error('Problem image conversion timed out.'))
    signal.addEventListener('abort', onAbort, { once: true })
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

async function enqueueImageConversion<T>(
  createWork: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  const queued = imageConversionQueue.then(() => {
    signal.throwIfAborted()
    return createWork()
  })
  imageConversionQueue = queued.then(
    () => {},
    () => {},
  )
  return raceWithSignal(queued, signal)
}

async function loadPngDataUri(
  url: URL,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<LoadedImage | null> {
  const cacheKey = url.href
  const cached = imageCache.get(cacheKey)
  if (cached !== undefined) {
    rememberImage(cacheKey, cached)
    return cached
  }

  try {
    const imageSignal = requestSignal(signal)
    let currentUrl = url
    let response: Response | null = null
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
      const candidate = await fetchImpl(currentUrl, { signal: imageSignal, redirect: 'manual' })
      if (!REDIRECT_STATUSES.has(candidate.status)) {
        response = candidate
        break
      }
      await candidate.body?.cancel()
      const location = candidate.headers.get('location')
      if (location === null || redirectCount === MAX_REDIRECTS) return null
      const nextUrl = safeImageUrl(new URL(location, currentUrl).href)
      if (nextUrl === null) return null
      currentUrl = nextUrl
    }
    if (response === null) return null
    if (!response.ok) {
      await response.body?.cancel()
      return null
    }
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim()
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType ?? '')) {
      await response.body?.cancel()
      return null
    }

    const input = await readBoundedBody(response)
    imageSignal.throwIfAborted()
    const converted = await enqueueImageConversion(async () => {
      const image = sharp(input, {
        failOn: 'warning',
        limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
      })
      const metadata = await image.metadata()
      if (metadata.width === undefined || metadata.height === undefined) {
        throw new Error('Problem image dimensions are unavailable.')
      }
      const png = await image
        .rotate()
        .resize({
          width: MAX_IMAGE_WIDTH,
          height: MAX_IMAGE_HEIGHT,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png({ compressionLevel: 9, palette: true, quality: 85 })
        .toBuffer()
      return { png, originalWidth: metadata.width, originalHeight: metadata.height }
    }, imageSignal)
    imageSignal.throwIfAborted()
    if (converted.png.byteLength > MAX_IMAGE_OUTPUT_BYTES) return null
    const loaded = {
      dataUri: `data:image/png;base64,${converted.png.toString('base64')}`,
      originalWidth: converted.originalWidth,
      originalHeight: converted.originalHeight,
    }
    rememberImage(cacheKey, loaded)
    return loaded
  } catch (error) {
    if (signal?.aborted === true) throw error
    return null
  }
}

function safeAltText(tag: string): string {
  const alt = htmlAttribute(tag, 'alt') ?? '题目图片'
  const safe = sanitizeOutput(decodeHtmlEntities(alt).replace(/<[^>]+>/g, '')).text.trim()
  return (safe || '题目图片').replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]')
}

function htmlTextToMarkdown(html: string): string {
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(
      /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi,
      (_match, code: string) =>
        `\n\n~~~\n${decodeHtmlEntities(code.replace(/<[^>]+>/g, ''))}\n~~~\n\n`,
    )
    .replace(
      /<code\b[^>]*>([\s\S]*?)<\/code>/gi,
      (_match, code: string) => `\`${decodeHtmlEntities(code.replace(/<[^>]+>/g, ''))}\``,
    )
    .replace(
      /<h([1-6])\b[^>]*>/gi,
      (_match, level: string) => `\n\n${'#'.repeat(Number(level) + 1)} `,
    )
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<(?:strong|b)\b[^>]*>/gi, '**')
    .replace(/<\/(?:strong|b)>/gi, '**')
    .replace(/<(?:em|i)\b[^>]*>/gi, '*')
    .replace(/<\/(?:em|i)>/gi, '*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(?:div|li|ol|p|pre|table|tr|ul)>/gi, '\n')
    .replace(/<\/?(?:td|th)\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
  return sanitizeOutput(
    decodeHtmlEntities(text)
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  ).text
}

export async function htmlToTerminalMarkdown(
  html: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<string> {
  const images: Array<{ token: string; tag: string; url: URL | null }> = []
  let imageIndex = 0
  const safeHtml = html.replace(/[\uE000-\uE003]/g, '�')
  const withPlaceholders = safeHtml.replace(/<img\b[^>]*>/gi, (tag) => {
    const token = `\uE000LE_E_IMAGE_${imageIndex++}\uE001`
    const source = htmlAttribute(tag, 'src')
    images.push({ token, tag, url: source === null ? null : safeImageUrl(source) })
    return `\n\n${token}\n\n`
  })

  const markdown = htmlTextToMarkdown(withPlaceholders)
  const replacements: string[] = []
  for (const [index, { tag, url }] of images.entries()) {
    signal?.throwIfAborted()
    const alt = safeAltText(tag)
    if (url === null) {
      replacements.push(`[图片: ${alt}]`)
      continue
    }
    if (index >= MAX_IMAGES_PER_STATEMENT) {
      replacements.push(`![${alt}](${url.href})`)
      continue
    }
    const loaded = await loadPngDataUri(url, fetchImpl, signal)
    const sizedAlt =
      loaded === null
        ? alt
        : `${alt}${IMAGE_SIZE_START}${loaded.originalWidth}x${loaded.originalHeight}${IMAGE_SIZE_END}`
    replacements.push(`![${sizedAlt}](${loaded?.dataUri ?? url.href})`)
  }
  return images.reduce(
    (output, image, index) => output.split(image.token).join(replacements[index] ?? '[题目图片]'),
    markdown,
  )
}
