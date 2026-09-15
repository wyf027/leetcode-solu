import { env as processEnvironment } from 'node:process'
import { resolve } from 'node:path'

import { RUNTIME_CONFIG } from '../config/runtime'
import { ERROR_CODES } from '../domain/errors'
import type { AppError, AppResult } from '../domain/errors'
import type { CommandResult, ParsedRunResult } from '../domain/operation'
import type { ParsedProblemList, ProblemDetail, ProblemSummary } from '../domain/problem'
import type { ChineseProblemCatalog } from './chineseProblemCatalog'
import { parseProblemDetail } from './parsers/detailParser'
import { parseProblemList, parseQuestionCatalog } from './parsers/listParser'
import { sanitizeOutput } from './parsers/outputSanitizer'
import { parseRunResult } from './parsers/runResultParser'
import { ProcessSpawnError } from './processRunner'
import type { CapturedProcessRequest, ProcessRunner } from './processRunner'
import { createSessionTokenStore } from './sessionTokens'
import type { SessionTokenStore } from './sessionTokens'
import type { Language } from '../config/languages'

const VERIFIED_VERSION = '0.5.4'
const VERSION_PATTERN = /\bleetcode\s+(?<version>\d+\.\d+\.\d+)\b/i
const EXPLICIT_AUTH_ERROR =
  /(?:ChromeNotLogin|cookies? seems expired|please make sure you have logined|maybe you not login|authentication required|unauthorized)/i
const SITE_OR_NETWORK_ERROR =
  /(?:error sending request|network issue|dns|connection (?:failed|refused|reset)|tls|certificate|request timed out|http status|failed to download)/i
const UNSUPPORTED_QUESTION_ERROR = /no support for database and shell questions yet/i

export interface GatewayLogChunk {
  readonly stream: 'stdout' | 'stderr'
  readonly text: string
}

export interface GatewayCallOptions {
  readonly problemSlug?: string
  readonly signal?: AbortSignal
  readonly onLogChunk?: (chunk: GatewayLogChunk) => void
}

export interface GatewayEditOptions extends GatewayCallOptions {
  readonly language?: Language
  readonly bridgeEnvironment?: Readonly<Record<string, string>>
}

export interface CliVersionInfo {
  readonly version: string
  readonly supported: boolean
}

export interface GatewayRunValue {
  readonly command: CommandResult
  readonly result: ParsedRunResult
}

export interface LeetCodeGateway {
  configureSessionTokens(session: string, csrf: string): AppResult<void>
  clearSessionCookie(): void
  preflight(options?: GatewayCallOptions): Promise<AppResult<CliVersionInfo>>
  listProblems(options?: GatewayCallOptions): Promise<AppResult<ParsedProblemList>>
  listStarred(options?: GatewayCallOptions): Promise<AppResult<ParsedProblemList>>
  loadDetail(id: number, options?: GatewayCallOptions): Promise<AppResult<ProblemDetail>>
  edit(id: number, options?: GatewayEditOptions): Promise<AppResult<CommandResult>>
  test(id: number, options?: GatewayCallOptions): Promise<AppResult<GatewayRunValue>>
  submit(id: number, options?: GatewayCallOptions): Promise<AppResult<GatewayRunValue>>
}

export interface CreateLeetCodeGatewayOptions {
  readonly runner: ProcessRunner
  readonly command?: string
  readonly identityMode?: boolean
  readonly now?: () => number
  readonly chineseCatalog?: ChineseProblemCatalog
  readonly sessionTokens?: SessionTokenStore
}

interface SafeForwarder {
  push(chunk: string): void
  flush(): void
}

function createSafeForwarder(
  stream: GatewayLogChunk['stream'],
  onLogChunk: (chunk: GatewayLogChunk) => void,
): SafeForwarder {
  let pending = ''

  const emit = (text: string): void => {
    const sanitized = sanitizeOutput(text)
    onLogChunk({ stream, text: sanitized.text })
  }

  return {
    push(chunk) {
      pending += chunk.replace(/\r\n?/g, '\n')
      let newlineIndex = pending.indexOf('\n')
      while (newlineIndex >= 0) {
        emit(`${pending.slice(0, newlineIndex)}\n`)
        pending = pending.slice(newlineIndex + 1)
        newlineIndex = pending.indexOf('\n')
      }
    },
    flush() {
      if (pending === '') return
      emit(pending)
      pending = ''
    },
  }
}

function safeCommandResult(result: CommandResult, catalogue = false): CommandResult {
  const stdout = sanitizeOutput(
    result.stdout,
    catalogue
      ? { ...RUNTIME_CONFIG.outputLimits, streamBytes: 4 * 1024 * 1024 }
      : RUNTIME_CONFIG.outputLimits,
  )
  const stderr = sanitizeOutput(result.stderr)
  return {
    ...result,
    stdout: stdout.text,
    stderr: stderr.text,
    truncated: result.truncated || stdout.truncated || stderr.truncated,
  }
}

function commandDetail(result: CommandResult): string {
  return [result.stderr, result.stdout]
    .filter((value) => value.trim() !== '')
    .join('\n')
    .trim()
}

function commandError(result: CommandResult, submit: boolean): AppError | null {
  const detail = commandDetail(result)

  if (result.timedOut) {
    return {
      code: submit ? ERROR_CODES.submitUnknown : ERROR_CODES.commandTimeout,
      message: submit
        ? 'The submission may have been sent, but its final status is unknown.'
        : 'The LeetCode command timed out.',
      detail: detail || `Command exceeded its ${RUNTIME_CONFIG.timeoutsMs.remote} ms limit.`,
    }
  }

  if (result.cancelled) {
    return {
      code: submit ? ERROR_CODES.submitUnknown : ERROR_CODES.commandCancelled,
      message: submit
        ? 'The submission was interrupted and its final status is unknown.'
        : 'The LeetCode command was cancelled.',
      detail: detail || 'The child process was terminated before completion.',
    }
  }

  if (UNSUPPORTED_QUESTION_ERROR.test(detail)) {
    return {
      code: ERROR_CODES.commandFailed,
      message: '当前 LeetCode CLI 暂不支持数据库或 Shell 题目的编辑。',
      detail,
    }
  }

  if (EXPLICIT_AUTH_ERROR.test(detail)) {
    return {
      code: ERROR_CODES.authRequired,
      message: 'LeetCode authentication is required or has expired.',
      detail,
    }
  }

  if (result.exitCode === 0 && result.signal === null) return null

  if (SITE_OR_NETWORK_ERROR.test(detail)) {
    return {
      code: ERROR_CODES.siteOrNetwork,
      message: 'The configured LeetCode site or network request failed.',
      detail,
    }
  }

  if (submit && result.signal !== null) {
    return {
      code: ERROR_CODES.submitUnknown,
      message: 'The submission process ended before a final status was observed.',
      detail: detail || `Process ended with signal ${result.signal}.`,
    }
  }

  return {
    code: ERROR_CODES.commandFailed,
    message: 'The LeetCode command failed.',
    detail:
      detail ||
      `Process ended with ${
        result.signal === null ? `exit code ${String(result.exitCode)}` : `signal ${result.signal}`
      }.`,
  }
}

function spawnError(error: unknown): AppError {
  if (error instanceof ProcessSpawnError && error.code === 'ENOENT') {
    return {
      code: ERROR_CODES.cliNotFound,
      message: 'The leetcode executable was not found in PATH.',
      detail: error.message,
    }
  }

  return {
    code: ERROR_CODES.commandFailed,
    message: 'The LeetCode command could not be started.',
    detail: error instanceof Error ? error.message : String(error),
  }
}

function invalidId(id: number): AppResult<never> | null {
  if (Number.isSafeInteger(id) && id > 0) return null
  return {
    ok: false,
    error: {
      code: ERROR_CODES.commandFailed,
      message: 'A positive integer problem ID is required.',
    },
  }
}

export function createLeetCodeGateway({
  runner,
  command = resolve('work/clearloop-leetcode-cli-v0.5.4/target/release/le-e-account'),
  identityMode = true,
  now = Date.now,
  chineseCatalog,
  sessionTokens = createSessionTokenStore(),
}: CreateLeetCodeGatewayOptions): LeetCodeGateway {
  let identityVerified = false
  let catalogue: ParsedProblemList | undefined
  const questions = new Map<number, ProblemSummary>()
  const commandEnvironment = (
    extra?: Readonly<Record<string, string>>,
  ): NodeJS.ProcessEnv | undefined => {
    const environment = sessionTokens.environment()
    if (environment === undefined && extra === undefined && !identityMode) return undefined
    return {
      ...processEnvironment,
      ...extra,
      ...environment,
      ...(identityMode ? { LEETCODE_USE_QUESTION_ID: '1' } : {}),
    }
  }

  const normalizedTitle = (title: string) =>
    title.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
  const warnChineseFallback = (options: GatewayCallOptions): void => {
    options.onLogChunk?.({
      stream: 'stderr',
      text: '中文题库暂时不可用，本次显示 CLI 原文。\n',
    })
  }

  const localizeProblemList = async (
    parsed: AppResult<ParsedProblemList>,
    options: GatewayCallOptions,
  ): Promise<AppResult<ParsedProblemList>> => {
    if (!parsed.ok || chineseCatalog === undefined) return parsed
    try {
      const localizations = await chineseCatalog.list(options.signal)
      const localize = (problem: ParsedProblemList['summaries'][number]) => {
        const localized =
          problem.slug === undefined
            ? [...localizations.values()].find((item) => item.frontendId === String(problem.id))
            : localizations.get(problem.slug)
        return localized === undefined ||
          normalizedTitle(localized.originalTitle) !== normalizedTitle(problem.title)
          ? problem
          : {
              ...problem,
              frontendId: localized.frontendId,
              localizedTitle: localized.title,
              slug: localized.slug,
            }
      }
      return {
        ok: true,
        value: {
          ...parsed.value,
          summaries: parsed.value.summaries.map((problem) => {
            const localized =
              problem.slug === undefined
                ? [...localizations.values()].find((item) => item.frontendId === String(problem.id))
                : localizations.get(problem.slug)
            const candidates = parsed.value.collisionCandidates.get(problem.id)
            const canonical =
              localized === undefined
                ? undefined
                : candidates?.find(
                    (candidate) =>
                      normalizedTitle(candidate.title) === normalizedTitle(localized.originalTitle),
                  )
            return localize(canonical ?? problem)
          }),
          collisionCandidates: new Map(
            [...parsed.value.collisionCandidates].map(([id, candidates]) => [
              id,
              candidates.map(localize),
            ]),
          ),
        },
      }
    } catch {
      warnChineseFallback(options)
      return parsed
    }
  }

  const executeCaptured = async (
    args: readonly string[],
    timeoutMs: number | undefined,
    options: GatewayCallOptions = {},
    submit = false,
    environment?: Readonly<Record<string, string>>,
  ): Promise<AppResult<CommandResult>> => {
    const isCatalogue = identityMode && args[0] === 'list'
    const isQuestionOperation = ['pick', 'edit', 'test', 'exec'].includes(args[0] ?? '')
    const question = isQuestionOperation ? questions.get(Number(args[1])) : undefined
    if (
      identityMode &&
      isQuestionOperation &&
      (!identityVerified || question?.slug === undefined)
    ) {
      return {
        ok: false,
        error: {
          code: ERROR_CODES.commandFailed,
          message: '题目唯一标识尚未确认，请先运行 pnpm setup:account 并刷新题库。',
        },
      }
    }
    const stdoutForwarder =
      options.onLogChunk === undefined || isCatalogue
        ? undefined
        : createSafeForwarder('stdout', options.onLogChunk)
    const stderrForwarder =
      options.onLogChunk === undefined
        ? undefined
        : createSafeForwarder('stderr', options.onLogChunk)
    const request: CapturedProcessRequest = { command, args }
    if (isCatalogue) Object.assign(request, { outputLimitBytes: 4 * 1024 * 1024 })

    if (timeoutMs !== undefined) Object.assign(request, { timeoutMs })
    if (options.signal !== undefined) Object.assign(request, { signal: options.signal })
    const env = commandEnvironment({
      ...environment,
      ...(identityMode && question?.slug ? { LEETCODE_EXPECTED_SLUG: question.slug } : {}),
    })
    if (env !== undefined) {
      Object.assign(request, { env })
    }
    if (stdoutForwarder !== undefined) {
      Object.assign(request, { onStdoutChunk: (chunk: string) => stdoutForwarder.push(chunk) })
    }
    if (stderrForwarder !== undefined) {
      Object.assign(request, { onStderrChunk: (chunk: string) => stderrForwarder.push(chunk) })
    }

    try {
      const result = safeCommandResult(await runner.runCaptured(request), isCatalogue)
      stdoutForwarder?.flush()
      stderrForwarder?.flush()
      const error = commandError(result, submit)
      if (error?.code === ERROR_CODES.authRequired) sessionTokens.clear()
      return error === null ? { ok: true, value: result } : { ok: false, error }
    } catch (error) {
      stdoutForwarder?.flush()
      stderrForwarder?.flush()
      return { ok: false, error: spawnError(error) }
    }
  }

  return {
    configureSessionTokens(session, csrf) {
      const validated = sessionTokens.configure(session, csrf)
      if (!validated.ok) {
        return {
          ok: false,
          error: { code: ERROR_CODES.authRequired, message: validated.error },
        }
      }
      return { ok: true, value: undefined }
    },

    clearSessionCookie() {
      sessionTokens.clear()
      catalogue = undefined
      questions.clear()
    },

    async preflight(options = {}) {
      const executed = await executeCaptured(
        [identityMode ? 'identity-version' : '--version'],
        RUNTIME_CONFIG.timeoutsMs.standard,
        options,
      )
      if (!executed.ok)
        return identityMode
          ? {
              ok: false,
              error: {
                code: ERROR_CODES.cliVersionUnsupported,
                message: '题库助手需要更新，请运行 pnpm setup:account 后重启。',
              },
            }
          : executed
      if (identityMode) {
        identityVerified = executed.value.stdout.trim() === 'leetcode 0.5.4 le-e-question-id-v1'
        if (!identityVerified)
          return {
            ok: false,
            error: {
              code: ERROR_CODES.cliVersionUnsupported,
              message: '题库助手不支持唯一题目标识，请运行 pnpm setup:account 后重启。',
            },
          }
      }

      const match = VERSION_PATTERN.exec(`${executed.value.stdout}\n${executed.value.stderr}`)
      const version = match?.groups?.version
      if (version === undefined) {
        return {
          ok: false,
          error: {
            code: ERROR_CODES.parse,
            message: 'The LeetCode CLI version output could not be parsed.',
          },
        }
      }
      return { ok: true, value: { version, supported: version === VERIFIED_VERSION } }
    },

    async listProblems(options = {}) {
      const executed = await executeCaptured(['list'], RUNTIME_CONFIG.timeoutsMs.standard, options)
      if (!executed.ok) return executed
      const result = await localizeProblemList(
        identityMode
          ? parseQuestionCatalog(executed.value.stdout)
          : parseProblemList(executed.value.stdout),
        options,
      )
      if (result.ok) {
        catalogue = result.value
        questions.clear()
        for (const problem of result.value.summaries) questions.set(problem.id, problem)
      }
      return result
    },

    async listStarred(options = {}) {
      if (identityMode) {
        if (!catalogue)
          return {
            ok: false,
            error: { code: ERROR_CODES.parse, message: '请先加载完整题库，再读取收藏状态。' },
          }
        return {
          ok: true,
          value: {
            ...catalogue,
            summaries: catalogue.summaries.filter((problem) => problem.starred),
          },
        }
      }
      const executed = await executeCaptured(
        ['list', '-q', 's'],
        RUNTIME_CONFIG.timeoutsMs.standard,
        options,
      )
      return executed.ok
        ? localizeProblemList(parseProblemList(executed.value.stdout, { starred: true }), options)
        : executed
    },

    async loadDetail(id, options = {}) {
      const idError = invalidId(id)
      if (idError !== null) return idError
      const problem = identityMode ? questions.get(id) : undefined
      const slug = problem?.slug ?? options.problemSlug
      if (
        identityMode &&
        (!problem || (options.problemSlug !== undefined && options.problemSlug !== problem.slug))
      ) {
        return {
          ok: false,
          error: { code: ERROR_CODES.parse, message: '所选题目的唯一标识不匹配，请刷新题库。' },
        }
      }
      if (slug !== undefined) {
        try {
          const detail = await chineseCatalog?.loadDetail(slug, options.signal)
          if (detail) {
            if (identityMode && detail.questionId !== id) {
              return {
                ok: false,
                error: {
                  code: ERROR_CODES.parse,
                  message: '题面返回了不同的 questionId，已阻止后续操作。',
                },
              }
            }
            return {
              ok: true,
              value: {
                id,
                slug,
                title: detail.originalTitle,
                localizedTitle: detail.title,
                statement: detail.statement,
                fetchedAt: now(),
              },
            }
          }
        } catch {
          // Only the identity-aware helper may be used as a fallback.
        }
        if (!identityMode || options.signal?.aborted)
          return {
            ok: false,
            error: {
              code: options.signal?.aborted ? ERROR_CODES.commandCancelled : ERROR_CODES.parse,
              message: options.signal?.aborted
                ? '题面加载已取消。'
                : '未能加载所选题面的内容，请稍后按 Enter 重试。',
            },
          }
      }
      const executed = await executeCaptured(
        ['pick', String(id)],
        RUNTIME_CONFIG.timeoutsMs.standard,
        options,
      )
      if (!executed.ok) return executed
      const parsed = parseProblemDetail(executed.value.stdout, id, now())
      if (identityMode) {
        if (!parsed.ok || !problem?.slug) return parsed
        return { ok: true, value: { ...parsed.value, slug: problem.slug } }
      }
      if (!parsed.ok || chineseCatalog === undefined) return parsed
      try {
        const localized = await chineseCatalog.loadDetail(id, options.signal)
        return localized === null ||
          normalizedTitle(localized.originalTitle) !== normalizedTitle(parsed.value.title)
          ? parsed
          : {
              ok: true,
              value: {
                ...parsed.value,
                localizedTitle: localized.title,
                statement: localized.statement,
              },
            }
      } catch {
        if (options.signal?.aborted === true) {
          return {
            ok: false,
            error: {
              code: ERROR_CODES.commandCancelled,
              message: 'The LeetCode detail request was cancelled.',
            },
          }
        }
        warnChineseFallback(options)
        return parsed
      }
    },

    async edit(id, options = {}) {
      const idError = invalidId(id)
      if (idError !== null) return idError
      if (identityMode || options.bridgeEnvironment !== undefined) {
        return executeCaptured(
          ['edit', String(id), '--lang', options.language ?? RUNTIME_CONFIG.language],
          undefined,
          options,
          false,
          options.bridgeEnvironment,
        )
      }
      const request = {
        command,
        args: ['edit', String(id), '--lang', options.language ?? RUNTIME_CONFIG.language],
      }
      if (options.signal !== undefined) Object.assign(request, { signal: options.signal })

      try {
        const result = safeCommandResult(await runner.runInherited(request))
        const error = commandError(result, false)
        if (error?.code === ERROR_CODES.authRequired) sessionTokens.clear()
        return error === null ? { ok: true, value: result } : { ok: false, error }
      } catch (error) {
        return { ok: false, error: spawnError(error) }
      }
    },

    async test(id, options = {}) {
      const idError = invalidId(id)
      if (idError !== null) return idError
      const executed = await executeCaptured(
        ['test', String(id)],
        RUNTIME_CONFIG.timeoutsMs.remote,
        options,
      )
      return executed.ok
        ? {
            ok: true,
            value: {
              command: executed.value,
              result: parseRunResult(executed.value.stdout, 'test'),
            },
          }
        : executed
    },

    async submit(id, options = {}) {
      const idError = invalidId(id)
      if (idError !== null) return idError
      const executed = await executeCaptured(
        ['exec', String(id)],
        RUNTIME_CONFIG.timeoutsMs.remote,
        options,
        true,
      )
      return executed.ok
        ? {
            ok: true,
            value: {
              command: executed.value,
              result: parseRunResult(executed.value.stdout, 'submit'),
            },
          }
        : executed
    },
  }
}
