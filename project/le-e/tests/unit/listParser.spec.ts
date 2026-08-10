import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { parseProblemList } from '../../src/infrastructure/parsers/listParser'

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/leetcode-0.5.4/${name}`, import.meta.url), 'utf8')
}

describe('parseProblemList', () => {
  it('parses status, difficulty, acceptance, and duplicate candidates', () => {
    const result = parseProblemList(fixture('list-basic.txt'))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.summaries).toHaveLength(3)
    expect(result.value.summaries[0]).toEqual({
      id: 1,
      title: 'Two Sum',
      difficulty: 'Easy',
      acceptance: 55.18,
      solveStatus: 'solved',
      starred: false,
      identityStatus: 'provisional',
    })
    expect(result.value.summaries[1]?.solveStatus).toBe('attempted')
    expect(result.value.summaries[2]?.solveStatus).toBe('locked')
    expect(result.value.collisionCandidates.get(1)?.map(({ title }) => title)).toEqual([
      'Two Sum',
      'Guess Numbers',
      '两数相除',
    ])
    expect(result.value.duplicateCount).toBe(2)
    expect(result.value.unparsedLineCount).toBe(0)
  })

  it('marks every row from a starred query as starred', () => {
    const result = parseProblemList(fixture('list-starred.txt'), { starred: true })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.summaries.map(({ id, starred }) => [id, starred])).toEqual([
      [37, true],
      [72, true],
    ])
  })

  it('preserves CJK, emoji, and combining characters', () => {
    const result = parseProblemList(fixture('list-unicode.txt'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.summaries.map(({ title }) => title)).toEqual([
      '合并两个有序数组 🙂',
      'Café 组合字符 é',
    ])
  })

  it('strips ANSI and tolerates individual malformed lines', () => {
    const input = `\u001B[32m${fixture('list-malformed.txt')}\u001B[0m`
    const result = parseProblemList(input)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.summaries).toHaveLength(1)
    expect(result.value.summaries[0]?.title).toBe('Palindrome Number')
    expect(result.value.unparsedLineCount).toBe(2)
  })

  it('accepts an empty result but rejects wholly unparseable non-empty output', () => {
    const empty = parseProblemList('\n')
    const broken = parseProblemList('future format only')

    expect(empty).toMatchObject({ ok: true, value: { summaries: [] } })
    expect(broken).toMatchObject({
      ok: false,
      error: { code: 'PARSE_ERROR' },
    })
  })
})
