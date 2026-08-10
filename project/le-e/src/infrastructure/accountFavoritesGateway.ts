import { ERROR_CODES } from '../domain/errors'
import type { AppResult } from '../domain/errors'
import type { FavoriteFolder, FavoriteQuestionRef } from '../domain/favorite'
import { sanitizeOutput } from './parsers/outputSanitizer'
import type { ProcessRunner } from './processRunner'

function safeArgument(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 240 &&
    [...value].every((character) => character.codePointAt(0)! >= 32 && character !== '\u007f')
  )
}

export interface AccountFavoritesGateway {
  listFolders(signal?: AbortSignal): Promise<AppResult<readonly FavoriteFolder[]>>
  add(folderSlug: string, questionSlug: string, signal?: AbortSignal): Promise<AppResult<void>>
  remove(folderSlug: string, questionSlug: string, signal?: AbortSignal): Promise<AppResult<void>>
}

export interface CreateAccountFavoritesGatewayOptions {
  readonly runner: ProcessRunner
  readonly command: string
}

function parseQuestion(value: unknown): FavoriteQuestionRef | null {
  if (typeof value !== 'object' || value === null) return null
  const title = Reflect.get(value, 'title')
  const slug = Reflect.get(value, 'slug')
  return typeof title === 'string' && title !== '' && typeof slug === 'string' && slug !== ''
    ? { title, slug }
    : null
}

function parseFolder(value: unknown): FavoriteFolder | null {
  if (typeof value !== 'object' || value === null) return null
  const slug = Reflect.get(value, 'slug')
  const name = Reflect.get(value, 'name')
  const writable = Reflect.get(value, 'writable')
  const rawQuestions = Reflect.get(value, 'questions')
  if (
    typeof slug !== 'string' ||
    slug === '' ||
    typeof name !== 'string' ||
    name === '' ||
    typeof writable !== 'boolean' ||
    !Array.isArray(rawQuestions)
  ) {
    return null
  }
  return {
    slug,
    name,
    writable,
    questions: rawQuestions.map(parseQuestion).filter((question) => question !== null),
  }
}

function parseJson(stdout: string): AppResult<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(sanitizeOutput(stdout).text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? { ok: true, value: parsed as Record<string, unknown> }
      : {
          ok: false,
          error: { code: ERROR_CODES.parse, message: '收藏助手返回了无效数据。' },
        }
  } catch {
    return {
      ok: false,
      error: { code: ERROR_CODES.parse, message: '收藏助手返回了无效 JSON。' },
    }
  }
}

export function createAccountFavoritesGateway({
  runner,
  command,
}: CreateAccountFavoritesGatewayOptions): AccountFavoritesGateway {
  const execute = async (
    args: readonly string[],
    signal?: AbortSignal,
  ): Promise<AppResult<Record<string, unknown>>> => {
    if (args.some((argument) => !safeArgument(argument))) {
      return {
        ok: false,
        error: { code: ERROR_CODES.commandFailed, message: '收藏参数不合法。' },
      }
    }
    try {
      const request = { command, args, timeoutMs: 30_000 }
      if (signal !== undefined) Object.assign(request, { signal })
      const result = await runner.runCaptured(request)
      if (result.exitCode !== 0 || result.signal !== null || result.timedOut || result.cancelled) {
        return {
          ok: false,
          error: {
            code: ERROR_CODES.commandFailed,
            message: '收藏助手不可用。',
            detail: '请先运行 pnpm setup:account，并确认 LeetCode 已登录。',
          },
        }
      }
      return parseJson(result.stdout)
    } catch {
      return {
        ok: false,
        error: {
          code: ERROR_CODES.commandFailed,
          message: '收藏助手未安装。',
          detail: '请先运行 pnpm setup:account。',
        },
      }
    }
  }

  const mutate = async (
    operation: 'add' | 'remove',
    folderSlug: string,
    questionSlug: string,
    signal?: AbortSignal,
  ): Promise<AppResult<void>> => {
    const response = await execute(
      [operation, '--folder', folderSlug, '--question', questionSlug],
      signal,
    )
    if (!response.ok) return response
    const result = response.value.result
    const ok = typeof result === 'object' && result !== null && Reflect.get(result, 'ok') === true
    if (ok) return { ok: true, value: undefined }
    return {
      ok: false,
      error: { code: ERROR_CODES.commandFailed, message: '收藏状态更新失败。' },
    }
  }

  return {
    async listFolders(signal) {
      const response = await execute(['folders'], signal)
      if (!response.ok) return response
      const rawFolders = response.value.folders
      if (!Array.isArray(rawFolders)) {
        return {
          ok: false,
          error: { code: ERROR_CODES.parse, message: '收藏夹列表缺失。' },
        }
      }
      return { ok: true, value: rawFolders.map(parseFolder).filter((folder) => folder !== null) }
    },
    add(folderSlug, questionSlug, signal) {
      return mutate('add', folderSlug, questionSlug, signal)
    },
    remove(folderSlug, questionSlug, signal) {
      return mutate('remove', folderSlug, questionSlug, signal)
    },
  }
}
