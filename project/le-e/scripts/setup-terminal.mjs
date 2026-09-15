import { chmod } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// The published macOS spawn helper is shipped without its executable bit.
if (process.platform === 'darwin') {
  const require = createRequire(import.meta.url)
  const root = dirname(require.resolve('node-pty/package.json'))
  await chmod(join(root, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper'), 0o755)
}
