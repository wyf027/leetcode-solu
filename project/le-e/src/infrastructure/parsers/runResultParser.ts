import type { FailedTestCase, ParsedRunResult } from '../../domain/operation'
import { sanitizeOutput } from './outputSanitizer'

const SUCCESS_STATUS = /^(?:Accepted|Success)\b/i
const FAILURE_STATUS =
  /^(?:Wrong Answer|Compile Error|Runtime Error|Time Limit Exceeded|Memory Limit Exceeded|Output Limit Exceeded|Internal Error)\b:?/i
const TEST_CASE_FIELD = /^\s*(?<label>Your input|Input|Output|Expected):\s*(?<value>.*)$/i

function parseFailedTestCase(lines: readonly string[]): FailedTestCase | undefined {
  const values: Partial<Record<'input' | 'actual' | 'expected', string>> = {}
  let current: 'input' | 'actual' | 'expected' | null = null

  for (const line of lines) {
    const match = TEST_CASE_FIELD.exec(line)
    const groups = match?.groups
    if (groups) {
      const label = (groups.label ?? '').toLocaleLowerCase()
      current = label === 'output' ? 'actual' : label === 'expected' ? 'expected' : 'input'
      values[current] = groups.value ?? ''
      continue
    }
    if (current === null || line.trim() === '') continue
    values[current] = `${values[current] ?? ''}\n${line}`.trim()
  }

  if (values.input === undefined && values.actual === undefined && values.expected === undefined) {
    return undefined
  }
  return { ...values }
}

export function parseRunResult(input: string, kind: 'test' | 'submit'): ParsedRunResult {
  const sanitized = sanitizeOutput(input)
  const lines = sanitized.text.split('\n')
  const firstStatusLine = lines.map((line) => line.trim()).find(Boolean)

  if (!firstStatusLine) {
    return {
      kind,
      outcome: 'unknown',
      message: 'No result output.',
      truncated: sanitized.truncated,
    }
  }

  if (SUCCESS_STATUS.test(firstStatusLine)) {
    return {
      kind,
      outcome: kind === 'test' ? 'passed' : 'accepted',
      message: firstStatusLine,
      truncated: sanitized.truncated,
    } as ParsedRunResult
  }

  if (FAILURE_STATUS.test(firstStatusLine)) {
    const failedCase = kind === 'test' ? parseFailedTestCase(lines) : undefined
    return {
      kind,
      outcome: kind === 'test' ? 'failed' : 'rejected',
      message: firstStatusLine,
      truncated: sanitized.truncated,
      ...(failedCase === undefined ? {} : { failedCase }),
    } as ParsedRunResult
  }

  return {
    kind,
    outcome: 'unknown',
    message: firstStatusLine,
    truncated: sanitized.truncated,
  } as ParsedRunResult
}
