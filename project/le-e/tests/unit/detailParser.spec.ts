import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { parseProblemDetail } from '../../src/infrastructure/parsers/detailParser'

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/leetcode-0.5.4/${name}`, import.meta.url), 'utf8')
}

describe('parseProblemDetail', () => {
  it('extracts the requested ID, title, and normalized statement', () => {
    const result = parseProblemDetail(fixture('pick-two-sum.txt'), 1, 1_234)

    expect(result).toEqual({
      ok: true,
      value: {
        id: 1,
        title: 'Two Sum',
        statement:
          'Given an integer array and a target, return the matching indices.\n\n' +
          'Example:\nInput: nums = [2,7], target = 9\nOutput: [0,1]',
        fetchedAt: 1_234,
      },
    })
  })

  it('rejects a detail header for a different ID', () => {
    const result = parseProblemDetail('[2] Add Two Numbers is on the run...\nBody', 1)

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'PARSE_ERROR', detail: 'Expected problem 1 but received 2.' },
    })
  })

  it('allows an empty statement but rejects output without a header', () => {
    expect(parseProblemDetail('[1] Two Sum is on the run...\n', 1)).toMatchObject({
      ok: true,
      value: { statement: '' },
    })
    expect(parseProblemDetail('no detail header', 1)).toMatchObject({
      ok: false,
      error: { code: 'PARSE_ERROR' },
    })
  })
})
