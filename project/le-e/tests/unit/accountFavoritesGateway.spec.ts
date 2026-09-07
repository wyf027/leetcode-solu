import { describe, expect, it, vi } from 'vitest'

import type { CommandResult } from '../../src/domain/operation'
import { createAccountFavoritesGateway } from '../../src/infrastructure/accountFavoritesGateway'
import type { ProcessRunner } from '../../src/infrastructure/processRunner'
import { createSessionTokenStore } from '../../src/infrastructure/sessionTokens'

const commandResult = (overrides: Partial<CommandResult> = {}): CommandResult => ({
  command: 'fake-account-helper',
  args: ['folders'],
  exitCode: 0,
  signal: null,
  stdout: JSON.stringify({
    status: 200,
    folders: [
      {
        slug: 'my-favorites',
        name: '我的收藏',
        writable: true,
        questions: [{ title: 'Two Sum', slug: 'two-sum' }],
      },
    ],
  }),
  stderr: '',
  durationMs: 1,
  timedOut: false,
  cancelled: false,
  truncated: false,
  ...overrides,
})

describe('AccountFavoritesGateway session tokens', () => {
  it('passes the shared token environment to folders and removes it after clear', async () => {
    const runCaptured = vi.fn<ProcessRunner['runCaptured']>().mockResolvedValue(commandResult())
    const sessionTokens = createSessionTokenStore()
    const gateway = createAccountFavoritesGateway({
      runner: { runCaptured, runInherited: vi.fn() },
      command: 'fake-account-helper',
      sessionTokens,
    })
    sessionTokens.configure('session-example', 'csrf-example')

    await expect(gateway.listFolders()).resolves.toMatchObject({
      ok: true,
      value: [{ slug: 'my-favorites', questions: [{ slug: 'two-sum' }] }],
    })
    expect({
      LEETCODE_SESSION: runCaptured.mock.calls[0]?.[0].env?.LEETCODE_SESSION,
      LEETCODE_CSRF: runCaptured.mock.calls[0]?.[0].env?.LEETCODE_CSRF,
      LEETCODE_SITE: runCaptured.mock.calls[0]?.[0].env?.LEETCODE_SITE,
    }).toEqual({
      LEETCODE_SESSION: 'session-example',
      LEETCODE_CSRF: 'csrf-example',
      LEETCODE_SITE: 'leetcode.cn',
    })

    sessionTokens.clear()
    await gateway.listFolders()
    expect(runCaptured.mock.calls[1]?.[0].env?.LEETCODE_SESSION).toBeUndefined()
    expect(runCaptured.mock.calls[1]?.[0].env?.LEETCODE_CSRF).toBeUndefined()
  })

  it('clears the shared store when the helper explicitly rejects authentication', async () => {
    const runCaptured = vi.fn<ProcessRunner['runCaptured']>().mockResolvedValue(
      commandResult({
        exitCode: 1,
        stdout: '',
        stderr: 'ChromeNotLogin',
      }),
    )
    const sessionTokens = createSessionTokenStore()
    sessionTokens.configure('session-example', 'csrf-example')
    const gateway = createAccountFavoritesGateway({
      runner: { runCaptured, runInherited: vi.fn() },
      command: 'fake-account-helper',
      sessionTokens,
    })

    await expect(gateway.listFolders()).resolves.toMatchObject({
      ok: false,
      error: { code: 'AUTH_REQUIRED' },
    })
    expect(sessionTokens.environment()).toBeUndefined()
  })

  it('maps an exit-zero ChromeNotLogin marker before JSON parsing', async () => {
    const runCaptured = vi
      .fn<ProcessRunner['runCaptured']>()
      .mockResolvedValue(commandResult({ stdout: 'ChromeNotLogin\n' }))
    const sessionTokens = createSessionTokenStore()
    sessionTokens.configure('session-example', 'csrf-example')
    const gateway = createAccountFavoritesGateway({
      runner: { runCaptured, runInherited: vi.fn() },
      command: 'fake-account-helper',
      sessionTokens,
    })

    await expect(gateway.listFolders()).resolves.toMatchObject({
      ok: false,
      error: { code: 'AUTH_REQUIRED' },
    })
    expect(sessionTokens.environment()).toBeUndefined()
  })

  it('passes the shared token environment to add and remove operations', async () => {
    const runCaptured = vi.fn<ProcessRunner['runCaptured']>().mockResolvedValue(
      commandResult({
        stdout: JSON.stringify({ status: 200, result: { ok: true } }),
      }),
    )
    const sessionTokens = createSessionTokenStore()
    sessionTokens.configure('session-example', 'csrf-example')
    const gateway = createAccountFavoritesGateway({
      runner: { runCaptured, runInherited: vi.fn() },
      command: 'fake-account-helper',
      sessionTokens,
    })

    await expect(gateway.add('my-favorites', 'two-sum')).resolves.toEqual({
      ok: true,
      value: undefined,
    })
    await expect(gateway.remove('my-favorites', 'two-sum')).resolves.toEqual({
      ok: true,
      value: undefined,
    })
    expect(runCaptured.mock.calls.map(([request]) => request.args)).toEqual([
      ['add', '--folder', 'my-favorites', '--question', 'two-sum'],
      ['remove', '--folder', 'my-favorites', '--question', 'two-sum'],
    ])
    for (const [request] of runCaptured.mock.calls) {
      expect(request.env?.LEETCODE_SESSION).toBe('session-example')
      expect(request.env?.LEETCODE_CSRF).toBe('csrf-example')
    }
  })
})
