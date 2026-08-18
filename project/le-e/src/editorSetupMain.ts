import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  EditorSetupError,
  applyEditorSetup,
  restoreEditorSetup,
} from './infrastructure/editorSetup'

const bridgeExecutable = resolve(dirname(fileURLToPath(import.meta.url)), '../bin/le-e-editor')

async function main(): Promise<void> {
  const action = process.argv[2]
  if (action === '--apply') {
    const result = await applyEditorSetup(bridgeExecutable)
    process.stdout.write(
      result === 'applied'
        ? 'LeetCode editor bridge configured.\n'
        : 'LeetCode editor bridge is already configured.\n',
    )
    return
  }
  if (action === '--restore') {
    await restoreEditorSetup(bridgeExecutable)
    process.stdout.write('Previous LeetCode editor restored.\n')
    return
  }
  throw new EditorSetupError('Usage: pnpm setup:editor --apply | --restore')
}

void main().catch((error: unknown) => {
  const message = error instanceof EditorSetupError ? error.message : 'Editor setup failed.'
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
