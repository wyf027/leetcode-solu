import { lstat, readFile, realpath } from 'node:fs/promises'
import { extname } from 'node:path'
import { TextDecoder } from 'node:util'

import { RUNTIME_CONFIG } from '../config/runtime'
import { LANGUAGES } from '../config/languages'
import type { Language } from '../config/languages'
import { ERROR_CODES } from '../domain/errors'
import type { ErrorCode } from '../domain/errors'

export interface ValidatedSourceFile {
  readonly path: string
}

export class SourceFileError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SourceFileError'
    this.code = code
  }
}

function rejectSource(message: string, cause?: unknown): SourceFileError {
  const options = cause === undefined ? undefined : { cause }
  return new SourceFileError(ERROR_CODES.sourceFileRejected, message, options)
}

async function inspectSourcePath(path: string, language: Language): Promise<string> {
  let entry
  try {
    entry = await lstat(path, { bigint: true })
  } catch (error) {
    throw rejectSource('The source file could not be inspected.', error)
  }

  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw rejectSource('The editor bridge path must be a regular non-symbolic-link file.')
  }
  if (entry.size > BigInt(RUNTIME_CONFIG.sourceFileLimitBytes)) {
    throw rejectSource('The source file exceeded the 1 MiB limit.')
  }
  const currentUid = process.getuid?.()
  if (currentUid !== undefined && entry.uid !== BigInt(currentUid)) {
    throw rejectSource('The source file is not owned by the current user.')
  }

  const resolved = await realpath(path)
  const expected = LANGUAGES.find(({ value }) => value === language)?.extension
  if (expected === undefined || extname(resolved).toLowerCase() !== expected) {
    throw rejectSource('The editor bridge source file must match the selected language.')
  }

  return resolved
}

async function readBounded(path: string): Promise<Buffer> {
  const buffer = await readFile(path)
  if (buffer.byteLength > RUNTIME_CONFIG.sourceFileLimitBytes) {
    throw rejectSource('The source file exceeded the 1 MiB limit.')
  }
  return buffer
}

export async function loadSourceFile(
  path: string,
  language: Language = 'javascript',
): Promise<ValidatedSourceFile> {
  const realPath = await inspectSourcePath(path, language)
  let buffer: Buffer
  try {
    buffer = await readBounded(realPath)
  } catch (error) {
    if (error instanceof SourceFileError) throw error
    throw rejectSource('The source file could not be read.', error)
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw rejectSource('The source file must contain valid UTF-8 text.')
  }
  return { path: realPath }
}
