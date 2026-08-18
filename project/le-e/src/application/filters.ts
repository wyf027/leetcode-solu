import type { Difficulty, ProblemSummary } from '../domain/problem'

export interface ProblemFilters {
  readonly query: string
  readonly difficulty: Difficulty | 'all'
  readonly starredOnly: boolean
}

export function filterProblems(
  problems: readonly ProblemSummary[],
  filters: ProblemFilters,
): ProblemSummary[] {
  const query = filters.query.trim()
  const numericQuery = /^\d+$/.test(query) ? Number(query) : null
  const titleQuery = query.toLocaleLowerCase()

  return problems.filter((problem) => {
    const matchesQuery =
      query === '' ||
      (numericQuery === null
        ? [problem.title, problem.localizedTitle ?? ''].some((title) =>
            title.toLocaleLowerCase().includes(titleQuery),
          )
        : problem.id === numericQuery)
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
