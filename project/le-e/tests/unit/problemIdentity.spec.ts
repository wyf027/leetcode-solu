import { describe, expect, it } from 'vitest'

import type { ProblemDetail, ProblemSummary } from '../../src/domain/problem'
import { resolveProblemIdentity } from '../../src/application/problemIdentity'

function summary(id: number, title: string, difficulty: ProblemSummary['difficulty']) {
  return {
    id,
    title,
    difficulty,
    acceptance: 50,
    solveStatus: 'unsolved' as const,
    starred: false,
    identityStatus: 'provisional' as const,
  }
}

function detail(id: number, title: string): ProblemDetail {
  return { id, title, statement: 'body', fetchedAt: 1 }
}

describe('resolveProblemIdentity', () => {
  it('resolves a direct title match with normalized whitespace and case', () => {
    const result = resolveProblemIdentity(summary(1, 'Two   Sum', 'Easy'), detail(1, 'two sum'))

    expect(result).toMatchObject({
      status: 'resolved',
      replaced: false,
      summary: { id: 1, title: 'Two   Sum', identityStatus: 'resolved' },
    })
  })

  it('replaces the provisional row when pick matches a collision candidate', () => {
    const current = summary(1, 'Guess Numbers', 'Easy')
    const canonical = summary(1, 'Two Sum', 'Easy')
    const result = resolveProblemIdentity(current, detail(1, 'Two Sum'), [current, canonical])

    expect(result).toMatchObject({
      status: 'resolved',
      replaced: true,
      summary: { title: 'Two Sum', identityStatus: 'resolved' },
    })
  })

  it('marks an unmatched title or ID as conflict', () => {
    expect(
      resolveProblemIdentity(summary(1, 'Two Sum', 'Easy'), detail(1, 'Unexpected')),
    ).toMatchObject({
      status: 'conflict',
      summary: { title: 'Unexpected', identityStatus: 'conflict' },
    })
    expect(
      resolveProblemIdentity(summary(1, 'Two Sum', 'Easy'), detail(2, 'Two Sum')),
    ).toMatchObject({
      status: 'conflict',
      summary: { identityStatus: 'conflict' },
    })
  })
})
