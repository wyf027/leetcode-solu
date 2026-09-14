import { execFile } from 'node:child_process'

/** Called only for an explicit paste shortcut; never log subprocess output/errors. */
export function readClipboardText(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') {
      reject(new Error('请使用终端菜单粘贴。'))
      return
    }
    execFile(
      '/usr/bin/pbpaste',
      [],
      { encoding: 'utf8', timeout: 2000, maxBuffer: 64 * 1024 },
      (error, stdout) => {
        if (error) reject(new Error('无法读取剪贴板，请使用终端菜单粘贴。'))
        else resolve(stdout)
      },
    )
  })
}
