#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const args = process.argv.slice(2)

const list = [
  '      ✔ [  1 ] 两数之和                                                     Easy   (55.18 %)',
  '      ✘ [  2 ] 两数相加                                                     Medium (47.09 %)',
  '  🔒    [  3 ] 会员示例                                                     Hard   (10.00 %)',
].join('\n')

const pick = (id) => {
  if (id === '2') return '[2] 两数相加 is on the run...\n\n将两个链表表示的整数相加。'
  if (id === '3') return '[3] 会员示例 is on the run...\n\n会员题目内容。'
  return '[1] 两数之和 is on the run...\n\n给定一个整数数组和目标值，返回两数的下标。'
}

async function runEditor(id) {
  const sourceDirectory = join(tmpdir(), `le-e-fake-${process.getuid?.() ?? 'user'}`)
  const sourcePath = join(sourceDirectory, `${id}.solution.js`)
  await mkdir(sourceDirectory, { recursive: true, mode: 0o700 })
  await writeFile(sourcePath, `var solve = function (input) {\n  return input\n}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  }).catch((error) => {
    if (error.code !== 'EEXIST') throw error
  })
  await chmod(sourcePath, 0o600)
  const helper = resolve(projectRoot, 'bin/le-e-editor')
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [helper, sourcePath], {
      env: {
        ...process.env,
        PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter),
      },
      stdio: 'inherit',
      shell: false,
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (signal !== null || code !== 0) reject(new Error('Fake editor bridge failed.'))
      else resolvePromise()
    })
  })
}

if (args[0] === '--version') process.stdout.write('leetcode 0.5.4\n')
else if (args[0] === 'list') process.stdout.write(`${list}\n`)
else if (args[0] === 'pick') process.stdout.write(`${pick(args[1] ?? '1')}\n`)
else if (args[0] === 'edit') await runEditor(args[1] ?? '1')
else if (args[0] === 'test')
  process.stdout.write(
    process.env.LE_E_FAKE_TEST_FAIL === '1'
      ? 'Wrong Answer   Runtime: 1 ms\nYour input:    [2,7], 9\nOutput:        [1,0]\nExpected:      [0,1]\n'
      : 'Accepted       Runtime: 0 ms\n',
  )
else if (args[0] === 'exec') process.stdout.write('Accepted\n')
else {
  process.stderr.write(`Unsupported fake command: ${args.join(' ')}\n`)
  process.exitCode = 2
}
