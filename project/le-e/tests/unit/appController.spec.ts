import { describe, expect, it, vi } from 'vitest'

import { createAppController } from '../../src/application/createAppController'
import { ERROR_CODES } from '../../src/domain/errors'
import type { AppResult } from '../../src/domain/errors'
import type { CommandResult, ParsedRunResult } from '../../src/domain/operation'
import type { ParsedProblemList, ProblemSummary } from '../../src/domain/problem'
import type {
  CliVersionInfo,
  GatewayRunValue,
  LeetCodeGateway,
} from '../../src/infrastructure/leetcodeGateway'

function summary(id: number, title: string, starred = false): ProblemSummary {
  return {
    id,
    title,
    difficulty: id === 2 ? 'Medium' : 'Easy',
    acceptance: 50,
    solveStatus: 'unsolved',
    starred,
    identityStatus: 'provisional',
  }
}

function parsedList(
  summaries: readonly ProblemSummary[],
  collisions: ReadonlyMap<number, readonly ProblemSummary[]> = new Map(),
): ParsedProblemList {
  return {
    summaries,
    collisionCandidates: collisions,
    duplicateCount: [...collisions.values()].reduce((total, rows) => total + rows.length - 1, 0),
    unparsedLineCount: 0,
    sourceTruncated: false,
  }
}

function commandResult(): CommandResult {
  return {
    command: 'fake-leetcode',
    args: [],
    exitCode: 0,
    signal: null,
    stdout: '',
    stderr: '',
    durationMs: 1,
    timedOut: false,
    cancelled: false,
    truncated: false,
  }
}

function runValue(result: ParsedRunResult): GatewayRunValue {
  return { command: commandResult(), result }
}

function harness() {
  const gateway = {
    preflight: vi.fn<LeetCodeGateway['preflight']>(),
    listProblems: vi.fn<LeetCodeGateway['listProblems']>(),
    listStarred: vi.fn<LeetCodeGateway['listStarred']>(),
    loadDetail: vi.fn<LeetCodeGateway['loadDetail']>(),
    edit: vi.fn<LeetCodeGateway['edit']>(),
    test: vi.fn<LeetCodeGateway['test']>(),
    submit: vi.fn<LeetCodeGateway['submit']>(),
  } satisfies LeetCodeGateway

  gateway.preflight.mockResolvedValue({
    ok: true,
    value: { version: '0.5.4', supported: true },
  } satisfies AppResult<CliVersionInfo>)
  gateway.listProblems.mockResolvedValue({ ok: true, value: parsedList([]) })
  gateway.listStarred.mockResolvedValue({ ok: true, value: parsedList([]) })
  gateway.edit.mockResolvedValue({ ok: true, value: commandResult() })
  gateway.test.mockResolvedValue({
    ok: true,
    value: runValue({
      kind: 'test',
      outcome: 'passed',
      message: 'Accepted',
      truncated: false,
    }),
  })
  gateway.submit.mockResolvedValue({
    ok: true,
    value: runValue({
      kind: 'submit',
      outcome: 'accepted',
      message: 'Success',
      truncated: false,
    }),
  })

  let timestamp = 0
  const controller = createAppController({ gateway, now: () => ++timestamp })
  return { controller, gateway }
}

async function prepareProblem(
  controller: ReturnType<typeof createAppController>,
  gateway: ReturnType<typeof harness>['gateway'],
) {
  gateway.listProblems.mockResolvedValue({
    ok: true,
    value: parsedList([summary(1, 'Two Sum')]),
  })
  gateway.loadDetail.mockResolvedValue({
    ok: true,
    value: { id: 1, title: 'Two Sum', statement: 'body', fetchedAt: 1 },
  })
  await controller.refresh()
  await controller.editSelected()
}

describe('createAppController', () => {
  it('refreshes list then starred data and commits one merged snapshot', async () => {
    const { controller, gateway } = harness()
    const order: string[] = []
    gateway.listProblems.mockImplementation(async () => {
      order.push('list')
      return { ok: true, value: parsedList([summary(1, 'Two Sum'), summary(2, 'Add Two')]) }
    })
    gateway.listStarred.mockImplementation(async () => {
      order.push('starred')
      return { ok: true, value: parsedList([summary(2, 'Add Two', true)]) }
    })

    await expect(controller.refresh()).resolves.toBe(true)

    expect(order).toEqual(['list', 'starred'])
    expect(controller.state.problems.map(({ id, starred }) => [id, starred])).toEqual([
      [1, false],
      [2, true],
    ])
    expect(controller.state.selectedProblemId).toBe(1)
    expect(controller.state.stale).toBe(false)
  })

  it('keeps the last good snapshot when either refresh command fails', async () => {
    const { controller, gateway } = harness()
    gateway.listProblems.mockResolvedValue({
      ok: true,
      value: parsedList([summary(1, 'Two Sum')]),
    })
    await controller.refresh()

    gateway.listProblems.mockResolvedValue({
      ok: false,
      error: { code: ERROR_CODES.commandFailed, message: 'failed' },
    })
    await expect(controller.refresh()).resolves.toBe(false)

    expect(controller.state.problems.map(({ title }) => title)).toEqual(['Two Sum'])
    expect(controller.state.stale).toBe(true)
  })

  it('resolves a collision before editing and marks source ready only on success', async () => {
    const { controller, gateway } = harness()
    const provisional = summary(1, 'Guess Numbers')
    const canonical = summary(1, 'Two Sum')
    gateway.listProblems.mockResolvedValue({
      ok: true,
      value: parsedList([provisional], new Map([[1, [provisional, canonical]]])),
    })
    gateway.loadDetail.mockResolvedValue({
      ok: true,
      value: { id: 1, title: 'Two Sum', statement: 'body', fetchedAt: 1 },
    })
    await controller.refresh()

    await expect(controller.editSelected()).resolves.toBe(true)

    expect(gateway.loadDetail.mock.invocationCallOrder[0]).toBeLessThan(
      gateway.edit.mock.invocationCallOrder[0]!,
    )
    expect(controller.state.problems[0]).toMatchObject({
      title: 'Two Sum',
      identityStatus: 'resolved',
    })
    expect(controller.state.sourceReadyIds.has(1)).toBe(true)

    gateway.edit.mockResolvedValueOnce({
      ok: false,
      error: { code: ERROR_CODES.commandFailed, message: 'editor failed' },
    })
    controller.state.sourceReadyIds.clear()
    await expect(controller.editSelected()).resolves.toBe(false)
    expect(controller.state.sourceReadyIds.has(1)).toBe(false)
  })

  it('blocks test until edit prepared the selected JavaScript source', async () => {
    const { controller, gateway } = harness()
    gateway.listProblems.mockResolvedValue({
      ok: true,
      value: parsedList([summary(1, 'Two Sum')]),
    })
    await controller.refresh()

    await expect(controller.testSelected()).resolves.toBe(false)
    expect(gateway.test).not.toHaveBeenCalled()

    gateway.loadDetail.mockResolvedValue({
      ok: true,
      value: { id: 1, title: 'Two Sum', statement: 'body', fetchedAt: 1 },
    })
    await controller.editSelected()
    await expect(controller.testSelected()).resolves.toBe(true)
    expect(controller.state.testStatuses.get(1)).toBe('passed')
  })

  it('submits exactly once and only after y in an open dialog', async () => {
    const { controller, gateway } = harness()
    await prepareProblem(controller, gateway)

    for (const key of ['Enter', 'Escape', 'n']) {
      expect(controller.openSubmitDialog()).toBe(true)
      await controller.handleSubmitDialogKey(key)
    }
    expect(gateway.submit).not.toHaveBeenCalled()

    expect(controller.openSubmitDialog()).toBe(true)
    await expect(controller.handleSubmitDialogKey('y')).resolves.toBe(true)
    await expect(controller.handleSubmitDialogKey('y')).resolves.toBe(false)
    expect(gateway.submit).toHaveBeenCalledTimes(1)
    expect(controller.state.submissionStatuses.get(1)).toBe('accepted')
  })

  it('does not start a second operation while refresh is active', async () => {
    const { controller, gateway } = harness()
    let resolveList: ((value: AppResult<ParsedProblemList>) => void) | undefined
    gateway.listProblems.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve
      }),
    )

    const first = controller.refresh()
    await expect(controller.refresh()).resolves.toBe(false)
    resolveList?.({ ok: true, value: parsedList([]) })
    await first

    expect(gateway.listProblems).toHaveBeenCalledTimes(1)
  })

  it('starts with no source-ready IDs and surfaces submit uncertainty without retry', async () => {
    const { controller, gateway } = harness()
    expect(controller.state.sourceReadyIds.size).toBe(0)
    await prepareProblem(controller, gateway)
    gateway.submit.mockResolvedValue({
      ok: false,
      error: { code: ERROR_CODES.submitUnknown, message: 'unknown' },
    })

    controller.openSubmitDialog()
    await controller.handleSubmitDialogKey('y')

    expect(gateway.submit).toHaveBeenCalledTimes(1)
    expect(controller.state.submissionStatuses.get(1)).toBe('unknown')
  })
})
