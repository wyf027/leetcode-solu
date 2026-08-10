import { spawn } from 'node:child_process'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = resolve(projectRoot, 'work/clearloop-leetcode-cli-v0.5.4')
const helperSource = resolve(projectRoot, 'tools/leetcode-account-helper/le-e-account.rs')
const pluginPatch = resolve(projectRoot, 'tools/leetcode-account-helper/leetcode-plugin.patch')
const helperTarget = resolve(sourceDirectory, 'src/bin/le-e-account.rs')
const expectedRevision = '99b0dacdf9a03bc03e10ada80dbe80c0490024a5'

const run = (command, args, cwd = projectRoot, capture = false) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    let stdout = ''
    let stderr = ''
    if (capture) child.stdout?.on('data', (chunk) => (stdout += chunk.toString('utf8')))
    if (capture) child.stderr?.on('data', (chunk) => (stderr += chunk.toString('utf8')))
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (signal !== null || code !== 0) {
        reject(
          new Error(`${command} exited unsuccessfully${stderr === '' ? '.' : ': command failed.'}`),
        )
      } else {
        resolvePromise(stdout.trim())
      }
    })
  })

await mkdir(dirname(sourceDirectory), { recursive: true })
try {
  await stat(resolve(sourceDirectory, '.git'))
} catch {
  await run('git', [
    'clone',
    '--depth',
    '1',
    '--branch',
    'v0.5.4',
    'https://github.com/clearloop/leetcode-cli.git',
    sourceDirectory,
  ])
}

const revision = await run('git', ['rev-parse', 'HEAD'], sourceDirectory, true)
if (revision !== expectedRevision) {
  throw new Error('The account helper source is not the verified clearloop/leetcode-cli v0.5.4.')
}

let patchAlreadyApplied = true
try {
  await run('git', ['apply', '--reverse', '--check', pluginPatch], sourceDirectory, true)
} catch {
  patchAlreadyApplied = false
}
if (!patchAlreadyApplied) await run('git', ['apply', pluginPatch], sourceDirectory)

await copyFile(helperSource, helperTarget)
await run('cargo', ['build', '--release', '--quiet', '--bin', 'le-e-account'], sourceDirectory)
process.stdout.write('LeetCode account helper is ready.\n')
