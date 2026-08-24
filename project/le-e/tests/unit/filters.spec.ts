import { describe, expect, it } from 'vitest'

import type { ProblemSummary } from '../../src/domain/problem'
import { filterProblems, selectVisibleProblemId } from '../../src/application/filters'

const problems: ProblemSummary[] = [
  {
    id: 1,
    title: 'Two Sum',
    localizedTitle: '两数之和',
    difficulty: 'Easy',
    acceptance: 55,
    solveStatus: 'solved',
    starred: true,
    identityStatus: 'provisional',
  },
  {
    id: 10,
    title: 'Regular Expression Matching',
    difficulty: 'Hard',
    acceptance: 29,
    solveStatus: 'unsolved',
    starred: false,
    identityStatus: 'provisional',
  },
  {
    id: 88,
    title: '合并两个有序数组',
    difficulty: 'Easy',
    acceptance: 53,
    solveStatus: 'unsolved',
    starred: true,
    identityStatus: 'provisional',
  },
]

describe('filterProblems', () => {
  it('matches partial numeric IDs', () => {
    expect(
      filterProblems(problems, { query: '1', difficulty: 'all', starredOnly: false }).map(
        ({ id }) => id,
      ),
    ).toEqual([1, 10])
  })

  it('normalizes width, case, and whitespace across English and Chinese titles', () => {
    expect(
      filterProblems(problems, {
        query: '  ｔｗｏ　ＳＵＭ  ',
        difficulty: 'all',
        starredOnly: false,
      }).map(({ id }) => id),
    ).toEqual([1])
    expect(
      filterProblems(problems, { query: '两数', difficulty: 'all', starredOnly: false }).map(
        ({ id }) => id,
      ),
    ).toEqual([1])
    expect(
      filterProblems(problems, { query: '合并', difficulty: 'all', starredOnly: false }).map(
        ({ id }) => id,
      ),
    ).toEqual([88])
  })

  it('intersects difficulty and starred filters', () => {
    expect(
      filterProblems(problems, { query: '1', difficulty: 'Hard', starredOnly: false }).map(
        ({ id }) => id,
      ),
    ).toEqual([10])
    expect(
      filterProblems(problems, { query: '1', difficulty: 'all', starredOnly: true }).map(
        ({ id }) => id,
      ),
    ).toEqual([1])
    expect(
      filterProblems(problems, { query: '', difficulty: 'Easy', starredOnly: true }).map(
        ({ id }) => id,
      ),
    ).toEqual([1, 88])
    expect(filterProblems(problems, { query: '', difficulty: 'Hard', starredOnly: true })).toEqual(
      [],
    )
  })
})

describe('selectVisibleProblemId', () => {
  it('keeps a visible selection, otherwise moves to the first row', () => {
    expect(selectVisibleProblemId(problems, 10)).toBe(10)
    expect(selectVisibleProblemId([problems[2]!], 10)).toBe(88)
    expect(selectVisibleProblemId([], 10)).toBeNull()
  })
})
