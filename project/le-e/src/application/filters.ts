import type { Difficulty, ProblemSummary } from '../domain/problem'

export interface ProblemFilters {
  readonly query: string
  readonly difficulty: Difficulty | 'all'
  readonly starredOnly: boolean
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function filterProblems(
  problems: readonly ProblemSummary[],
  filters: ProblemFilters,
): ProblemSummary[] {
  const query = normalizeSearchText(filters.query)
  const numericQuery = /^\d+$/.test(query)

  return problems.filter((problem) => {
    const matchesQuery =
      query === '' ||
      (numericQuery && String(problem.id).includes(query)) ||
      [problem.title, problem.localizedTitle ?? ''].some((title) =>
        normalizeSearchText(title).includes(query),
      )
    const matchesDifficulty =
      filters.difficulty === 'all' || problem.difficulty === filters.difficulty
    const matchesStarred = !filters.starredOnly || problem.starred
    return matchesQuery && matchesDifficulty && matchesStarred
  })
}

export function selectVisibleProblemId(
  visibleProblems: readonly ProblemSummary[],
  currentId: number | null,
): number | null {
  if (currentId !== null && visibleProblems.some(({ id }) => id === currentId)) {
    return currentId
  }
  return visibleProblems[0]?.id ?? null
}
