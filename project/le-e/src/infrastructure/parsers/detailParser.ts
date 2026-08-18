import { ERROR_CODES } from '../../domain/errors'
import type { AppResult } from '../../domain/errors'
import type { ProblemDetail } from '../../domain/problem'
import { sanitizeOutput } from './outputSanitizer'

const DETAIL_HEADER = /^\s*\[\s*(?<id>\d+)\s*\]\s+(?<title>.+?)\s+is on the run\.\.\.\s*$/

export function parseProblemDetail(
  input: string,
  expectedId: number,
  fetchedAt = Date.now(),
): AppResult<ProblemDetail> {
  const sanitized = sanitizeOutput(input)
  const lines = sanitized.text.split('\n')
  let headerIndex = -1
  let headerMatch: RegExpExecArray | null = null

  for (const [index, line] of lines.entries()) {
    const match = DETAIL_HEADER.exec(line)
    if (!match) continue
    headerIndex = index
    headerMatch = match
    break
  }

  const groups = headerMatch?.groups
  if (headerIndex < 0 || !groups) {
    return {
      ok: false,
      error: {
        code: ERROR_CODES.parse,
        message: 'LeetCode problem detail header could not be parsed.',
      },
    }
  }

  const id = Number(groups.id)
  if (id !== expectedId) {
    return {
      ok: false,
      error: {
        code: ERROR_CODES.parse,
        message: 'LeetCode returned a different problem than requested.',
        detail: `Expected problem ${expectedId} but received ${id}.`,
      },
    }
  }

  const statementLines = lines.slice(headerIndex + 1)
  while (statementLines[0]?.trim() === '') statementLines.shift()
  while (statementLines.at(-1)?.trim() === '') statementLines.pop()

  return {
    ok: true,
    value: {
      id,
      title: (groups.title ?? '').replace(/\s+/g, ' ').trim(),
      statement: statementLines.join('\n'),
      fetchedAt,
    },
  }
}
