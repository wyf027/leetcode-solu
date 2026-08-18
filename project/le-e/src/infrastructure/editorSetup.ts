import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import {
  access,
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  unlink,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { env as processEnvironment } from 'node:process'

export interface EditorFallbackConfig {
  readonly fallbackEditor: string
}

export interface EditorSetupPaths {
  readonly leetcodeConfigPath: string
  readonly fallbackConfigPath: string
}

export class EditorSetupError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'EditorSetupError'
  }
}

export function locateEditorSetupPaths(
  environment: NodeJS.ProcessEnv = processEnvironment,
): EditorSetupPaths {
  const home = homedir()
  const configHome = environment.XDG_CONFIG_HOME?.trim() || join(home, '.config')
  return {
    leetcodeConfigPath: join(home, '.leetcode', 'leetcode.toml'),
    fallbackConfigPath: join(configHome, 'le-e', 'config.json'),
  }
}

interface EditorLineMatch {
  readonly start: number
  readonly end: number
  readonly prefix: string
  readonly suffix: string
  readonly value: string
}

function decodeTomlString(quote: string, value: string): string {
  if (quote === "'") return value
  try {
    return JSON.parse(`"${value}"`) as string
  } catch (error) {
    throw new EditorSetupError('The LeetCode editor value is not a supported TOML string.', {
      cause: error,
    })
  }
}

function findEditorLine(content: string): EditorLineMatch {
  const sectionPattern = /^\s*\[([^\]]+)]\s*(?:#.*)?$/gm
  const sections = [...content.matchAll(sectionPattern)]
  const codeSections = sections.filter((match) => match[1]?.trim() === 'code')
  if (codeSections.length !== 1) {
    throw new EditorSetupError('Expected exactly one [code] section in leetcode.toml.')
  }

  const codeSection = codeSections[0]
  if (codeSection?.index === undefined) {
    throw new EditorSetupError('The [code] section location could not be determined.')
  }
  const sectionStart = codeSection.index + codeSection[0].length
  const nextSection = sections.find((match) => (match.index ?? 0) > codeSection.index)
  const sectionEnd = nextSection?.index ?? content.length
  const section = content.slice(sectionStart, sectionEnd)
  const editorPattern = /^(\s*editor\s*=\s*)(["'])(.*)\2(\s*(?:#.*)?)$/gm
  const matches = [...section.matchAll(editorPattern)]
  if (matches.length !== 1) {
    throw new EditorSetupError('Expected exactly one editor string in the [code] section.')
  }

  const match = matches[0]
  if (match?.index === undefined || match[1] === undefined || match[2] === undefined) {
    throw new EditorSetupError('The LeetCode editor line could not be parsed.')
  }
  return {
    start: sectionStart + match.index,
    end: sectionStart + match.index + match[0].length,
    prefix: match[1],
    suffix: match[4] ?? '',
    value: decodeTomlString(match[2], match[3] ?? ''),
  }
}

function replaceEditor(
  content: string,
  editor: string,
): { readonly content: string; readonly old: string } {
  const match = findEditorLine(content)
  const replacement = `${match.prefix}${JSON.stringify(editor)}${match.suffix}`
  return {
    content: `${content.slice(0, match.start)}${replacement}${content.slice(match.end)}`,
    old: match.value,
  }
}

async function atomicWrite(path: string, content: string, mode: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporaryPath = join(
    dirname(path),
    `.${process.pid}-${randomBytes(6).toString('hex')}.le-e.tmp`,
  )
  try {
    const handle = await open(temporaryPath, 'wx', mode)
    try {
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await chmod(temporaryPath, mode)
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    throw new EditorSetupError('An editor configuration file could not be written atomically.', {
      cause: error,
    })
  }
}

async function inspectRegularConfig(path: string): Promise<number> {
  let entry
  try {
    entry = await lstat(path)
  } catch (error) {
    throw new EditorSetupError('The LeetCode configuration file could not be inspected.', {
      cause: error,
    })
  }
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new EditorSetupError(
      'The LeetCode configuration must be a regular non-symbolic-link file.',
    )
  }
  return entry.mode & 0o777
}

async function inspectBridgeExecutable(path: string): Promise<void> {
  try {
    const entry = await stat(path)
    if (!entry.isFile()) {
      throw new EditorSetupError('The le-e editor bridge must resolve to a regular file.')
    }
    await access(path, constants.X_OK)
  } catch (error) {
    if (error instanceof EditorSetupError) throw error
    throw new EditorSetupError('The le-e editor bridge is missing or not executable.', {
      cause: error,
    })
  }
}

async function fallbackConfigExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw new EditorSetupError('The fallback editor configuration could not be inspected.', {
      cause: error,
    })
  }
}

export async function readEditorFallbackConfig(
  path = locateEditorSetupPaths().fallbackConfigPath,
): Promise<EditorFallbackConfig | null> {
  try {
    const entry = await lstat(path)
    if (entry.isSymbolicLink() || !entry.isFile()) return null
    const value = JSON.parse(await readFile(path, 'utf8')) as unknown
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as { fallbackEditor?: unknown }).fallbackEditor === 'string'
    ) {
      return { fallbackEditor: (value as { fallbackEditor: string }).fallbackEditor }
    }
    return null
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    return null
  }
}

export async function applyEditorSetup(
  bridgeExecutable: string,
  paths = locateEditorSetupPaths(),
): Promise<'applied' | 'already-applied'> {
  const bridge = resolve(bridgeExecutable)
  await inspectBridgeExecutable(bridge)
  const configMode = await inspectRegularConfig(paths.leetcodeConfigPath)
  const original = await readFile(paths.leetcodeConfigPath, 'utf8')
  const replacement = replaceEditor(original, bridge)
  if (resolve(replacement.old) === bridge) return 'already-applied'
  if (await fallbackConfigExists(paths.fallbackConfigPath)) {
    throw new EditorSetupError(
      'A fallback editor configuration already exists; setup refused to overwrite it.',
    )
  }

  await atomicWrite(
    paths.fallbackConfigPath,
    `${JSON.stringify({ fallbackEditor: replacement.old }, null, 2)}\n`,
    0o600,
  )
  try {
    await atomicWrite(paths.leetcodeConfigPath, replacement.content, configMode)
  } catch (error) {
    await unlink(paths.fallbackConfigPath).catch(() => {})
    throw error
  }
  return 'applied'
}

export async function restoreEditorSetup(
  bridgeExecutable: string,
  paths = locateEditorSetupPaths(),
): Promise<'restored'> {
  const fallback = await readEditorFallbackConfig(paths.fallbackConfigPath)
  if (fallback === null) {
    throw new EditorSetupError('No le-e fallback editor configuration was found.')
  }

  const bridge = resolve(bridgeExecutable)
  const configMode = await inspectRegularConfig(paths.leetcodeConfigPath)
  const original = await readFile(paths.leetcodeConfigPath, 'utf8')
  const current = findEditorLine(original).value
  if (resolve(current) !== bridge) {
    throw new EditorSetupError(
      'The LeetCode editor changed after setup; restore refused to overwrite it.',
    )
  }

  const replacement = replaceEditor(original, fallback.fallbackEditor)
  await atomicWrite(paths.leetcodeConfigPath, replacement.content, configMode)
  await unlink(paths.fallbackConfigPath).catch(() => {})
  return 'restored'
}
