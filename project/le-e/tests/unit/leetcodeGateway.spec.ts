import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import type { CommandResult } from '../../src/domain/operation'
import {
  createLeetCodeGateway,
  type GatewayLogChunk,
} from '../../src/infrastructure/leetcodeGateway'
import { ProcessSpawnError, type ProcessRunner } from '../../src/infrastructure/processRunner'

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/leetcode-0.5.4/${name}`, import.meta.url), 'utf8')
}

function commandResult(overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    command: 'fake-leetcode',
    args: [],
    exitCode: 0,
    signal: null,
    stdout: '',
    stderr: '',
    durationMs: 5,
    timedOut: false,
    cancelled: false,
    truncated: false,
    ...overrides,
  }
}

function harness() {
  const runCaptured = vi.fn<ProcessRunner['runCaptured']>()
  const runInherited = vi.fn<ProcessRunner['runInherited']>()
  const runner: ProcessRunner = { runCaptured, runInherited }
  const gateway = createLeetCodeGateway({
    runner,
    command: 'fake-leetcode',
    now: () => 1_234,
  })
  return { gateway, runCaptured, runInherited }
}

describe('LeetCodeGateway', () => {
  it('preflights the exact version command and flags unsupported versions', async () => {
    const supported = harness()
    supported.runCaptured.mockResolvedValue(commandResult({ stdout: 'leetcode 0.5.4\n' }))

    await expect(supported.gateway.preflight()).resolves.toEqual({
      ok: true,
      value: { version: '0.5.4', supported: true },
    })
    expect(supported.runCaptured).toHaveBeenCalledWith({
      command: 'fake-leetcode',
      args: ['--version'],
      timeoutMs: 30_000,
    })

    const unsupported = harness()
    unsupported.runCaptured.mockResolvedValue(commandResult({ stdout: 'leetcode 0.6.0' }))
    await expect(unsupported.gateway.preflight()).resolves.toMatchObject({
      ok: true,
      value: { version: '0.6.0', supported: false },
    })
  })

  it('uses fixed list and starred commands and parses their output', async () => {
    const { gateway, runCaptured } = harness()
    runCaptured
      .mockResolvedValueOnce(commandResult({ stdout: fixture('list-basic.txt') }))
      .mockResolvedValueOnce(commandResult({ stdout: fixture('list-starred.txt') }))

    const list = await gateway.listProblems()
    const starred = await gateway.listStarred()

    expect(runCaptured.mock.calls.map(([request]) => request.args)).toEqual([
      ['list'],
      ['list', '-q', 's'],
    ])
    expect(list).toMatchObject({ ok: true, value: { duplicateCount: 2 } })
    expect(starred).toMatchObject({
      ok: true,
      value: {
        summaries: [
          { id: 37, starred: true },
          { id: 72, starred: true },
        ],
      },
    })
  })

  it('loads details and edits with the approved argument order', async () => {
    const { gateway, runCaptured, runInherited } = harness()
    runCaptured.mockResolvedValue(commandResult({ stdout: fixture('pick-two-sum.txt') }))
    runInherited.mockResolvedValue(commandResult({ args: ['edit', '1', '--lang', 'javascript'] }))

    await expect(gateway.loadDetail(1)).resolves.toMatchObject({
      ok: true,
      value: { id: 1, title: 'Two Sum', fetchedAt: 1_234 },
    })
    await expect(gateway.edit(1)).resolves.toMatchObject({ ok: true })

    expect(runCaptured).toHaveBeenCalledWith({
      command: 'fake-leetcode',
      args: ['pick', '1'],
      timeoutMs: 30_000,
    })
    expect(runInherited).toHaveBeenCalledWith({
      command: 'fake-leetcode',
      args: ['edit', '1', '--lang', 'javascript'],
    })
  })

  it('tests and submits with remote timeouts and structured outcomes', async () => {
    const { gateway, runCaptured } = harness()
    runCaptured
      .mockResolvedValueOnce(commandResult({ stdout: fixture('test-passed.txt') }))
      .mockResolvedValueOnce(commandResult({ stdout: fixture('submit-accepted.txt') }))

    await expect(gateway.test(1)).resolves.toMatchObject({
      ok: true,
      value: { result: { kind: 'test', outcome: 'passed' } },
    })
    await expect(gateway.submit(1)).resolves.toMatchObject({
      ok: true,
      value: { result: { kind: 'submit', outcome: 'accepted' } },
    })
    expect(runCaptured.mock.calls.map(([request]) => [request.args, request.timeoutMs])).toEqual([
      [['test', '1'], 120_000],
      [['exec', '1'], 120_000],
    ])
  })

  it('buffers stream fragments before redacting log chunks', async () => {
    const { gateway, runCaptured } = harness()
    const chunks: GatewayLogChunk[] = []
    runCaptured.mockImplementation(async (request) => {
      request.onStdoutChunk?.('LEETCODE_SES')
      request.onStdoutChunk?.('SION=secret-value\nAccepted')
      return commandResult({ stdout: fixture('test-passed.txt') })
    })

    await gateway.test(1, { onLogChunk: (chunk) => chunks.push(chunk) })

    expect(chunks.map(({ text }) => text).join('')).not.toContain('secret-value')
    expect(chunks.map(({ text }) => text).join('')).toContain('LEETCODE_SESSION=[REDACTED]')
  })

  it('maps missing CLI, explicit auth, timeout, network, and parse errors', async () => {
    const missing = harness()
    missing.runCaptured.mockRejectedValue(
      new ProcessSpawnError(
        'fake-leetcode',
        Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }),
      ),
    )
    await expect(missing.gateway.preflight()).resolves.toMatchObject({
      ok: false,
      error: { code: 'CLI_NOT_FOUND' },
    })

    const auth = harness()
    auth.runCaptured.mockResolvedValue(
      commandResult({
        exitCode: 1,
        stderr: 'Your leetcode cookies seems expired, LEETCODE_SESSION=secret-value; please login.',
      }),
    )
    const authResult = await auth.gateway.listProblems()
    expect(authResult).toMatchObject({ ok: false, error: { code: 'AUTH_REQUIRED' } })
    if (!authResult.ok) expect(authResult.error.detail).not.toContain('secret-value')

    const timeout = harness()
    timeout.runCaptured.mockResolvedValue(commandResult({ timedOut: true, exitCode: null }))
    await expect(timeout.gateway.test(1)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMAND_TIMEOUT' },
    })
    await expect(timeout.gateway.submit(1)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SUBMIT_STATUS_UNKNOWN' },
    })

    const network = harness()
    network.runCaptured.mockResolvedValue(
      commandResult({ exitCode: 1, stderr: 'error sending request: DNS lookup failed' }),
    )
    await expect(network.gateway.loadDetail(1)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SITE_OR_NETWORK_ERROR' },
    })

    const broken = harness()
    broken.runCaptured.mockResolvedValue(commandResult({ stdout: 'future list format' }))
    await expect(broken.gateway.listProblems()).resolves.toMatchObject({
      ok: false,
      error: { code: 'PARSE_ERROR' },
    })
  })
})
