export type Difficulty = 'Easy' | 'Medium' | 'Hard'

export type SolveStatus = 'solved' | 'attempted' | 'unsolved' | 'locked' | 'unknown'

export type IdentityStatus = 'provisional' | 'resolved' | 'conflict'

export interface ProblemSummary {
  readonly id: number
  readonly title: string
  readonly localizedTitle?: string
  readonly slug?: string
  readonly difficulty: Difficulty
  readonly acceptance: number | null
  readonly solveStatus: SolveStatus
  readonly starred: boolean
  readonly identityStatus: IdentityStatus
}

export interface ProblemDetail {
  readonly id: number
  readonly title: string
  readonly localizedTitle?: string
  readonly statement: string
  readonly fetchedAt: number
}

export interface ParsedProblemList {
  readonly summaries: readonly ProblemSummary[]
  readonly collisionCandidates: ReadonlyMap<number, readonly ProblemSummary[]>
  readonly duplicateCount: number
  readonly unparsedLineCount: number
  readonly sourceTruncated: boolean
}

export type TestStatus = 'not-run' | 'running' | 'passed' | 'failed' | 'unknown'

export type SubmissionStatus = 'idle' | 'running' | 'accepted' | 'rejected' | 'unknown'
