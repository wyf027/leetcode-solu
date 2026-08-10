import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { ProcessSpawnError, createProcessRunner } from '../../src/infrastructure/processRunner'

const fixturePath = fileURLToPath(new URL('../helpers/process-fixture.mjs', import.meta.url))

describe('processRunner', () => {
  it('passes argument metacharacters literally and captures both streams', async () => {
    const onStdoutChunk = vi.fn()
    const runner = createProcessRunner()
    const literal = '$(touch should-not-run); `echo nope`'

    const result = await runner.runCaptured({
      command: process.execPath,
      args: [fixturePath, 'echo', literal, 'stderr-value'],
      timeoutMs: 1_000,
      onStdoutChunk,
    })

    expect(result).toMatchObject({
      command: process.execPath,
      args: [fixturePath, 'echo', literal, 'stderr-value'],
      exitCode: 0,
      signal: null,
      stdout: literal,
      stderr: 'stderr-value',
      timedOut: false,
      cancelled: false,
      truncated: false,
    })
    expect(onStdoutChunk).toHaveBeenCalledWith(literal)
  })

  it('times out a process and requests graceful termination', async () => {
    const runner = createProcessRunner()
    const result = await runner.runCaptured({
      command: process.execPath,
      args: [fixturePath, 'wait', '1000'],
      timeoutMs: 30,
      cancellationGraceMs: 20,
    })

    expect(result.timedOut).toBe(true)
    expect(result.cancelled).toBe(false)
    expect(['SIGTERM', 'SIGKILL']).toContain(result.signal)
  })

  it('supports AbortSignal cancellation independently from timeout', async () => {
    const runner = createProcessRunner()
    const controller = new AbortController()
    const pending = runner.runCaptured({
      command: process.execPath,
      args: [fixturePath, 'wait', '1000'],
      timeoutMs: 2_000,
      cancellationGraceMs: 20,
      signal: controller.signal,
    })

    setTimeout(() => controller.abort(), 20)
    const result = await pending

    expect(result.cancelled).toBe(true)
    expect(result.timedOut).toBe(false)
  })

  it('escalates to SIGKILL when the child ignores SIGTERM', async () => {
    const runner = createProcessRunner()
    const result = await runner.runCaptured({
      command: process.execPath,
      args: [fixturePath, 'ignore-term'],
      timeoutMs: 1_000,
      cancellationGraceMs: 30,
    })

    expect(result.timedOut).toBe(true)
    expect(result.signal).toBe('SIGKILL')
  })

  it('terminates and marks output that exceeds the per-stream bound', async () => {
    const runner = createProcessRunner()
    const result = await runner.runCaptured({
      command: process.execPath,
      args: [fixturePath, 'flood', '10000'],
      timeoutMs: 1_000,
      cancellationGraceMs: 20,
      outputLimitBytes: 128,
    })

    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(128)
    expect(result.truncated).toBe(true)
  })

  it('supports inherited stdio without capturing editor output', async () => {
    const runner = createProcessRunner()
    const result = await runner.runInherited({
      command: process.execPath,
      args: [fixturePath, 'silent-exit', '3'],
    })

    expect(result).toMatchObject({
      exitCode: 3,
      stdout: '',
      stderr: '',
      truncated: false,
    })
  })

  it('reports spawn failures as ProcessSpawnError', async () => {
    const runner = createProcessRunner()

    await expect(
      runner.runCaptured({
        command: '/definitely/missing/le-e-command',
        args: [],
        timeoutMs: 100,
      }),
    ).rejects.toBeInstanceOf(ProcessSpawnError)
  })
})
