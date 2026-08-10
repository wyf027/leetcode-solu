import { ERROR_CODES } from '../../domain/errors'
import type { AppResult } from '../../domain/errors'
import type {
  Difficulty,
  ParsedProblemList,
  ProblemSummary,
  SolveStatus,
} from '../../domain/problem'
import { sanitizeOutput } from './outputSanitizer'

const PROBLEM_LINE =
  /^\s*(?<lock>🔒)?\s*(?<status>[✔✘])?\s*\[\s*(?<id>\d+)\s*\]\s+(?<title>.+?)\s+(?<difficulty>Easy|Medium|Hard)\s*(?:\(\s*(?<acceptance>\d+(?:\.\d+)?)\s*%\s*\))?\s*$/

export interface ParseProblemListOptions {
  readonly starred?: boolean
}

function solveStatus(lock: string | undefined, marker: string | undefined): SolveStatus {
  if (lock === '🔒') return 'locked'
  if (marker === '✔') return 'solved'
  if (marker === '✘') return 'attempted'
  return 'unsolved'
}

function parseLine(line: string, starred: boolean): ProblemSummary | null {
  const match = PROBLEM_LINE.exec(line)
  const groups = match?.groups
  if (!groups) return null

  const id = Number(groups.id)
  const acceptance = groups.acceptance === undefined ? null : Number(groups.acceptance)
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    (acceptance !== null && !Number.isFinite(acceptance))
  ) {
    return null
  }

  return {
    id,
    title: (groups.title ?? '').replace(/\s+/g, ' ').trim(),
    difficulty: groups.difficulty as Difficulty,
    acceptance,
    solveStatus: solveStatus(groups.lock, groups.status),
    starred,
    identityStatus: 'provisional',
  }
}

export function parseProblemList(
  input: string,
  options: ParseProblemListOptions = {},
): AppResult<ParsedProblemList> {
  const sanitized = sanitizeOutput(input)
  const summaries: ProblemSummary[] = []
  const candidatesById = new Map<number, ProblemSummary[]>()
  let unparsedLineCount = 0
  let nonEmptyLineCount = 0

  for (const line of sanitized.text.split('\n')) {
    if (line.trim() === '') continue
    nonEmptyLineCount += 1

    const problem = parseLine(line, options.starred ?? false)
    if (!problem) {
      unparsedLineCount += 1
      continue
    }

    const existing = candidatesById.get(problem.id)
    if (existing) {
      existing.push(problem)
    } else {
      candidatesById.set(problem.id, [problem])
      summaries.push(problem)
    }
  }

  if (nonEmptyLineCount > 0 && summaries.length === 0) {
    return {
      ok: false,
      error: {
        code: ERROR_CODES.parse,
        message: 'LeetCode problem list output could not be parsed.',
        detail: `${unparsedLineCount} non-empty line(s) were unrecognized.`,
      },
    }
  }

  const collisionCandidates = new Map<number, readonly ProblemSummary[]>()
  let duplicateCount = 0
  for (const [id, candidates] of candidatesById) {
    if (candidates.length <= 1) continue
    collisionCandidates.set(id, candidates)
    duplicateCount += candidates.length - 1
  }

  return {
    ok: true,
    value: {
      summaries,
      collisionCandidates,
      duplicateCount,
      unparsedLineCount,
      sourceTruncated: sanitized.truncated,
    },
  }
}
