import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { sanitizeOutput } from '../../src/infrastructure/parsers/outputSanitizer'

describe('sanitizeOutput', () => {
  it('removes ANSI and unsafe controls while preserving Unicode whitespace', () => {
    const result = sanitizeOutput('\u001B[31m错误🙂\u001B[0m\u0000\t保留\r\n下一行')

    expect(result).toEqual({
      text: '错误🙂\t保留\n下一行',
      truncated: false,
    })
  })

  it('redacts credential assignments, headers, and JSON values', () => {
    const input = [
      'LEETCODE_SESSION=session-value',
      'csrftoken: csrf-value',
      'Cookie: LEETCODE_SESSION=cookie-value; csrftoken=cookie-csrf',
      'Authorization: Bearer auth-value',
      '{"csrftoken":"json-value"}',
    ].join('\n')

    const result = sanitizeOutput(input)

    expect(result.text).not.toMatch(
      /session-value|csrf-value|cookie-value|cookie-csrf|auth-value|json-value/,
    )
    expect(result.text.match(/\[REDACTED\]/g)).toHaveLength(5)
    expect(result.truncated).toBe(false)
  })

  it('keeps each line within its UTF-8 byte limit', () => {
    const result = sanitizeOutput(`${'中'.repeat(2_000)}\nshort`)
    const [longLine, shortLine] = result.text.split('\n')

    expect(Buffer.byteLength(longLine ?? '', 'utf8')).toBeLessThanOrEqual(4 * 1024)
    expect(longLine).toContain('[TRUNCATED]')
    expect(shortLine).toBe('short')
    expect(result.truncated).toBe(true)
  })

  it('caps the whole stream without cutting a Unicode code point', () => {
    const result = sanitizeOutput('🙂'.repeat(100), {
      lineBytes: 1_024,
      streamBytes: 101,
    })

    expect(Buffer.byteLength(result.text, 'utf8')).toBeLessThanOrEqual(101)
    expect(result.text).not.toContain('�')
    expect(result.text).toContain('[TRUNCATED]')
    expect(result.truncated).toBe(true)
  })
})
