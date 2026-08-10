import { createHash, randomBytes } from 'node:crypto'
import { chmod, lstat, open, readFile, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { TextDecoder } from 'node:util'

import { RUNTIME_CONFIG } from '../config/runtime'
import { ERROR_CODES } from '../domain/errors'
import type { ErrorCode } from '../domain/errors'

export type SourceEol = '\n' | '\r\n'

interface SourceFingerprint {
  readonly device: string
  readonly inode: string
  readonly size: string
  readonly modifiedNanoseconds: string
  readonly digest: string
}

export interface LoadedSourceFile {
  readonly path: string
  readonly fileName: string
  readonly content: string
  readonly eol: SourceEol
  readonly hasFinalNewline: boolean
  readonly hasBom: boolean
  readonly mode: number
  readonly fingerprint: SourceFingerprint
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

function digest(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

async function inspectSourcePath(path: string): Promise<{
  readonly realPath: string
  readonly mode: number
  readonly fingerprintBase: Omit<SourceFingerprint, 'digest'>
}> {
  let entry
  try {
    entry = await lstat(path, { bigint: true })
  } catch (error) {
    throw rejectSource('The JavaScript source file could not be inspected.', error)
  }

  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw rejectSource('The editor bridge path must be a regular non-symbolic-link file.')
  }
  if (entry.size > BigInt(RUNTIME_CONFIG.sourceFileLimitBytes)) {
    throw rejectSource('The JavaScript source file exceeded the 1 MiB limit.')
  }
  const currentUid = process.getuid?.()
  if (currentUid !== undefined && entry.uid !== BigInt(currentUid)) {
    throw rejectSource('The JavaScript source file is not owned by the current user.')
  }

  const resolved = await realpath(path)
  if (extname(resolved).toLowerCase() !== '.js') {
    throw rejectSource('The editor bridge only accepts JavaScript source files.')
  }

  return {
    realPath: resolved,
    mode: Number(entry.mode & 0o777n),
    fingerprintBase: {
      device: entry.dev.toString(),
      inode: entry.ino.toString(),
      size: entry.size.toString(),
      modifiedNanoseconds: entry.mtimeNs.toString(),
    },
  }
}

function decodeSource(buffer: Buffer): {
  readonly content: string
  readonly eol: SourceEol
  readonly hasFinalNewline: boolean
  readonly hasBom: boolean
} {
  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw rejectSource('The JavaScript source file must contain valid UTF-8 text.')
  }
  const hasBom = decoded.startsWith('\uFEFF')
  const withoutBom = hasBom ? decoded.slice(1) : decoded
  const eol: SourceEol = withoutBom.includes('\r\n') ? '\r\n' : '\n'
  const normalized = withoutBom.replace(/\r\n?/g, '\n')
  return {
    content: normalized,
    eol,
    hasFinalNewline: normalized.endsWith('\n'),
    hasBom,
  }
}

async function readBounded(path: string): Promise<Buffer> {
  const buffer = await readFile(path)
  if (buffer.byteLength > RUNTIME_CONFIG.sourceFileLimitBytes) {
    throw rejectSource('The JavaScript source file exceeded the 1 MiB limit.')
  }
  return buffer
}

export async function loadSourceFile(path: string): Promise<LoadedSourceFile> {
  const inspected = await inspectSourcePath(path)
  let buffer: Buffer
  try {
    buffer = await readBounded(inspected.realPath)
  } catch (error) {
    if (error instanceof SourceFileError) throw error
    throw rejectSource('The JavaScript source file could not be read.', error)
  }
  const decoded = decodeSource(buffer)
  return {
    path: inspected.realPath,
    fileName: basename(inspected.realPath),
    content: decoded.content,
    eol: decoded.eol,
    hasFinalNewline: decoded.hasFinalNewline,
    hasBom: decoded.hasBom,
    mode: inspected.mode,
    fingerprint: { ...inspected.fingerprintBase, digest: digest(buffer) },
  }
}

function sameFingerprint(left: SourceFingerprint, right: SourceFingerprint): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.size === right.size &&
    left.modifiedNanoseconds === right.modifiedNanoseconds &&
    left.digest === right.digest
  )
}

async function currentFingerprint(path: string): Promise<SourceFingerprint> {
  const inspected = await inspectSourcePath(path)
  const buffer = await readBounded(inspected.realPath)
  return { ...inspected.fingerprintBase, digest: digest(buffer) }
}

function encodeSource(document: LoadedSourceFile, normalizedContent: string): Buffer {
  const withPreservedFinalNewline = document.hasFinalNewline
    ? normalizedContent.endsWith('\n')
      ? normalizedContent
      : `${normalizedContent}\n`
    : normalizedContent.replace(/\n+$/g, '')
  const withEol =
    document.eol === '\r\n'
      ? withPreservedFinalNewline.replace(/\n/g, '\r\n')
      : withPreservedFinalNewline
  return Buffer.from(`${document.hasBom ? '\uFEFF' : ''}${withEol}`, 'utf8')
}

export async function saveSourceFile(
  document: LoadedSourceFile,
  normalizedContent: string,
): Promise<LoadedSourceFile> {
  let fingerprint: SourceFingerprint
  try {
    fingerprint = await currentFingerprint(document.path)
  } catch (error) {
    if (error instanceof SourceFileError) throw error
    throw new SourceFileError(
      ERROR_CODES.sourceSaveFailed,
      'The JavaScript source file could not be checked before saving.',
      { cause: error },
    )
  }

  if (!sameFingerprint(fingerprint, document.fingerprint)) {
    throw new SourceFileError(
      ERROR_CODES.sourceFileChanged,
      'The JavaScript source file changed outside le-e; it was not overwritten.',
    )
  }

  const encoded = encodeSource(document, normalizedContent)
  if (encoded.byteLength > RUNTIME_CONFIG.sourceFileLimitBytes) {
    throw new SourceFileError(
      ERROR_CODES.sourceSaveFailed,
      'The edited JavaScript source exceeded the 1 MiB limit.',
    )
  }

  const temporaryPath = join(
    dirname(document.path),
    `.${basename(document.path)}.le-e-${process.pid}-${randomBytes(6).toString('hex')}.tmp`,
  )

  try {
    const handle = await open(temporaryPath, 'wx', document.mode)
    try {
      await handle.writeFile(encoded)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await chmod(temporaryPath, document.mode)
    await rename(temporaryPath, document.path)
    return await loadSourceFile(document.path)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    if (error instanceof SourceFileError) throw error
    throw new SourceFileError(
      ERROR_CODES.sourceSaveFailed,
      'The JavaScript source file could not be saved atomically.',
      { cause: error },
    )
  }
}
