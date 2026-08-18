import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

import { RUNTIME_CONFIG } from '../config/runtime'
import type { CommandResult } from '../domain/operation'

interface BaseProcessRequest {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly timeoutMs?: number
  readonly cancellationGraceMs?: number
  readonly signal?: AbortSignal
}

export interface CapturedProcessRequest extends BaseProcessRequest {
  readonly outputLimitBytes?: number
  readonly onStdoutChunk?: (chunk: string) => void
  readonly onStderrChunk?: (chunk: string) => void
}

export type InheritedProcessRequest = BaseProcessRequest

export interface ProcessRunner {
  runCaptured(request: CapturedProcessRequest): Promise<CommandResult>
  runInherited(request: InheritedProcessRequest): Promise<CommandResult>
}

export class ProcessSpawnError extends Error {
  readonly command: string
  readonly code: string | undefined

  constructor(command: string, cause: NodeJS.ErrnoException) {
    super(`Failed to start command: ${command}`, { cause })
    this.name = 'ProcessSpawnError'
    this.command = command
    this.code = cause.code
  }
}

interface CaptureState {
  readonly chunks: Buffer[]
  readonly decoder: StringDecoder
  readonly onChunk?: (chunk: string) => void
  bytes: number
}

function immediateCancelledResult(request: BaseProcessRequest): CommandResult {
  return {
    command: request.command,
    args: [...request.args],
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
    durationMs: 0,
    timedOut: false,
    cancelled: true,
    truncated: false,
  }
}

function spawnOptions(request: BaseProcessRequest, inherited: boolean): SpawnOptions {
  const options: SpawnOptions = {
    shell: false,
    stdio: inherited ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  }
  if (request.cwd !== undefined) options.cwd = request.cwd
  if (request.env !== undefined) options.env = request.env
  return options
}

function createCaptureState(onChunk?: (chunk: string) => void): CaptureState {
  const state: CaptureState = {
    chunks: [],
    decoder: new StringDecoder('utf8'),
    bytes: 0,
  }
  if (onChunk !== undefined) {
    return { ...state, onChunk }
  }
  return state
}

function decodeCapture(state: CaptureState): string {
  return Buffer.concat(state.chunks, state.bytes).toString('utf8')
}

function runProcess(
  request: CapturedProcessRequest | InheritedProcessRequest,
  inherited: boolean,
): Promise<CommandResult> {
  if (request.signal?.aborted === true) {
    return Promise.resolve(immediateCancelledResult(request))
  }

  return new Promise((resolve, reject) => {
    const startedAt = performance.now()
    const capturedRequest = inherited ? undefined : (request as CapturedProcessRequest)
    const outputLimit = capturedRequest?.outputLimitBytes ?? RUNTIME_CONFIG.outputLimits.streamBytes
    const stdoutState = createCaptureState(capturedRequest?.onStdoutChunk)
    const stderrState = createCaptureState(capturedRequest?.onStderrChunk)
    let settled = false
    let timedOut = false
    let cancelled = false
    let truncated = false
    let terminationRequested = false
    let timeoutHandle: NodeJS.Timeout | undefined
    let escalationHandle: NodeJS.Timeout | undefined
    let child: ChildProcess

    try {
      child = spawn(request.command, [...request.args], spawnOptions(request, inherited))
    } catch (error) {
      reject(new ProcessSpawnError(request.command, error as NodeJS.ErrnoException))
      return
    }

    const cleanUp = (): void => {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
      if (escalationHandle !== undefined) clearTimeout(escalationHandle)
      request.signal?.removeEventListener('abort', onAbort)
    }

    const requestTermination = (): void => {
      if (terminationRequested || settled) return
      terminationRequested = true
      child.kill('SIGTERM')
      escalationHandle = setTimeout(() => {
        if (!settled && child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL')
        }
      }, request.cancellationGraceMs ?? RUNTIME_CONFIG.timeoutsMs.cancellationGrace)
    }

    const capture = (state: CaptureState, chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const remaining = Math.max(0, outputLimit - state.bytes)
      const accepted = buffer.subarray(0, remaining)
      if (accepted.length > 0) {
        state.chunks.push(accepted)
        state.bytes += accepted.length
        const decoded = state.decoder.write(accepted)
        if (decoded !== '') state.onChunk?.(decoded)
      }
      if (accepted.length < buffer.length) {
        truncated = true
        requestTermination()
      }
    }

    function onAbort(): void {
      cancelled = true
      requestTermination()
    }

    if (!inherited) {
      child.stdout?.on('data', (chunk: Buffer | string) => capture(stdoutState, chunk))
      child.stderr?.on('data', (chunk: Buffer | string) => capture(stderrState, chunk))
    }

    child.once('error', (error: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      cleanUp()
      reject(new ProcessSpawnError(request.command, error))
    })

    child.once('close', (exitCode, signal) => {
      if (settled) return
      settled = true
      cleanUp()
      const stdoutTail = stdoutState.decoder.end()
      const stderrTail = stderrState.decoder.end()
      if (stdoutTail !== '') stdoutState.onChunk?.(stdoutTail)
      if (stderrTail !== '') stderrState.onChunk?.(stderrTail)

      resolve({
        command: request.command,
        args: [...request.args],
        exitCode,
        signal,
        stdout: inherited ? '' : decodeCapture(stdoutState),
        stderr: inherited ? '' : decodeCapture(stderrState),
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        timedOut,
        cancelled,
        truncated,
      })
    })

    request.signal?.addEventListener('abort', onAbort, { once: true })
    if (request.timeoutMs !== undefined) {
      timeoutHandle = setTimeout(() => {
        timedOut = true
        requestTermination()
      }, request.timeoutMs)
    }
  })
}

export function createProcessRunner(): ProcessRunner {
  return {
    runCaptured(request) {
      return runProcess(request, false)
    },
    runInherited(request) {
      return runProcess(request, true)
    },
  }
}
