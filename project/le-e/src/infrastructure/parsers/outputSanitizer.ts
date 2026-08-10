import { Buffer } from 'node:buffer'

import stripAnsi from 'strip-ansi'

import { RUNTIME_CONFIG } from '../../config/runtime'
import type { OutputLimits, SanitizedOutput } from '../../domain/operation'

const TRUNCATION_MARKER = '[TRUNCATED]'
const JSON_SECRET = /"(LEETCODE_SESSION|csrftoken|cookie|authorization)"\s*:\s*"[^"\r\n]*"/gi
const SECRET_HEADER =
  /^(\s*(?:set-cookie|cookie|authorization|LEETCODE_SESSION|csrftoken)\s*:\s*).+$/gim
const SECRET_ASSIGNMENT =
  /\b(LEETCODE_SESSION|csrftoken)\s*=\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s;,&\r\n]+)/gi

function truncateUtf8(value: string, maximumBytes: number): string {
  let bytes = 0
  let result = ''

  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8')
    if (bytes + characterBytes > maximumBytes) {
      break
    }
    result += character
    bytes += characterBytes
  }

  return result
}

function truncateWithMarker(value: string, maximumBytes: number): string {
  const markerBytes = Buffer.byteLength(TRUNCATION_MARKER, 'utf8')
  if (maximumBytes <= markerBytes) {
    return truncateUtf8(TRUNCATION_MARKER, maximumBytes)
  }

  return `${truncateUtf8(value, maximumBytes - markerBytes)}${TRUNCATION_MARKER}`
}

function redactSecrets(value: string): string {
  return value
    .replace(JSON_SECRET, (_match, name: string) => `"${name}":"[REDACTED]"`)
    .replace(SECRET_HEADER, '$1[REDACTED]')
    .replace(SECRET_ASSIGNMENT, '$1=[REDACTED]')
}

function removeUnsafeControls(value: string): string {
  return [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return !(
        codePoint <= 8 ||
        (codePoint >= 11 && codePoint <= 12) ||
        (codePoint >= 14 && codePoint <= 31) ||
        (codePoint >= 127 && codePoint <= 159)
      )
    })
    .join('')
}

export function sanitizeOutput(
  input: string,
  limits: OutputLimits = RUNTIME_CONFIG.outputLimits,
): SanitizedOutput {
  let truncated = false
  const safeText = redactSecrets(removeUnsafeControls(stripAnsi(input).replace(/\r\n?/g, '\n')))

  const boundedLines = safeText.split('\n').map((line) => {
    if (Buffer.byteLength(line, 'utf8') <= limits.lineBytes) {
      return line
    }

    truncated = true
    return truncateWithMarker(line, limits.lineBytes)
  })

  const boundedText = boundedLines.join('\n')
  if (Buffer.byteLength(boundedText, 'utf8') <= limits.streamBytes) {
    return { text: boundedText, truncated }
  }

  return {
    text: truncateWithMarker(boundedText, limits.streamBytes),
    truncated: true,
  }
}
