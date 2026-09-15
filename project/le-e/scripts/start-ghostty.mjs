import { spawn } from 'node:child_process'
import { access, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') throw new Error('start:ghostty currently supports macOS.')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entry = join(root, 'dist-terminal/main.js')
await access(entry).catch(() => {
  throw new Error('请先运行 corepack pnpm build。')
})
const built = await stat(entry)
for (const source of [
  'src/App.vue',
  'src/infrastructure/embeddedMicro.ts',
  'src/infrastructure/microCompletion.ts',
]) {
  if ((await stat(join(root, source))).mtimeMs > built.mtimeMs) {
    throw new Error('快捷键代码尚未构建，请先运行 corepack pnpm build。')
  }
}
let app
for (const candidate of [
  '/Applications/Ghostty.app',
  join(homedir(), 'Applications/Ghostty.app'),
]) {
  if (
    await access(candidate).then(
      () => true,
      () => false,
    )
  ) {
    app = candidate
    break
  }
}
if (!app) throw new Error('未找到 Ghostty.app，请先安装 Ghostty。')
const child = spawn(
  '/usr/bin/open',
  [
    '-na',
    app,
    '--args',
    `--config-file=${join(root, 'config/ghostty-vscode.conf')}`,
    `--working-directory=${root}`,
    '-e',
    process.execPath,
    entry,
  ],
  { stdio: 'inherit' },
)
child.once('error', () => {
  console.error('无法打开 Ghostty。')
  process.exitCode = 1
})
child.once('exit', (code) => {
  process.exitCode = code ?? 1
})
