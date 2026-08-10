import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { parseRunResult } from '../../src/infrastructure/parsers/runResultParser'

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/leetcode-0.5.4/${name}`, import.meta.url), 'utf8')
}

describe('parseRunResult', () => {
  it('classifies passing and failing tests from the first status line', () => {
    expect(parseRunResult(fixture('test-passed.txt'), 'test')).toMatchObject({
      kind: 'test',
      outcome: 'passed',
      message: expect.stringMatching(/^Accepted/),
    })
    expect(parseRunResult(fixture('test-failed.txt'), 'test')).toMatchObject({
      kind: 'test',
      outcome: 'failed',
      message: expect.stringMatching(/^Wrong Answer/),
    })
  })

  it('classifies accepted and rejected submissions', () => {
    expect(parseRunResult(fixture('submit-accepted.txt'), 'submit')).toMatchObject({
      kind: 'submit',
      outcome: 'accepted',
    })
    expect(parseRunResult('\nCompile Error:\nUnexpected token', 'submit')).toMatchObject({
      kind: 'submit',
      outcome: 'rejected',
      message: 'Compile Error:',
    })
  })

  it('uses unknown for empty or future result formats', () => {
    expect(parseRunResult('', 'test')).toEqual({
      kind: 'test',
      outcome: 'unknown',
      message: 'No result output.',
      truncated: false,
    })
    expect(parseRunResult('Future Judge State', 'submit')).toMatchObject({
      kind: 'submit',
      outcome: 'unknown',
    })
  })
})
