import type { IdentityStatus, ProblemDetail, ProblemSummary } from '../domain/problem'

export interface IdentityResolution {
  readonly status: IdentityStatus
  readonly summary: ProblemSummary
  readonly replaced: boolean
}

function normalizedTitle(title: string): string {
  return title.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

export function resolveProblemIdentity(
  current: ProblemSummary,
  detail: ProblemDetail,
  collisionCandidates: readonly ProblemSummary[] = [current],
): IdentityResolution {
  if (current.id !== detail.id) {
    return {
      status: 'conflict',
      summary: { ...current, identityStatus: 'conflict' },
      replaced: false,
    }
  }

  const pickedTitle = normalizedTitle(detail.title)
  if (normalizedTitle(current.title) === pickedTitle) {
    return {
      status: 'resolved',
      summary: { ...current, identityStatus: 'resolved' },
      replaced: false,
    }
  }

  const matchingCandidate = collisionCandidates.find(
    ({ title }) => normalizedTitle(title) === pickedTitle,
  )
  if (matchingCandidate) {
    return {
      status: 'resolved',
      summary: {
        ...matchingCandidate,
        starred: current.starred,
        identityStatus: 'resolved',
      },
      replaced: true,
    }
  }

  return {
    status: 'conflict',
    summary: { ...current, title: detail.title, identityStatus: 'conflict' },
    replaced: false,
  }
}
