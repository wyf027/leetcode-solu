import { delimiter, dirname, resolve } from 'node:path'

import { runTerminalApp } from '../src/main'

process.env.PATH = [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter)
runTerminalApp({
  cliCommand: resolve('scripts/fake-leetcode.mjs'),
  accountHelperCommand: resolve('scripts/fake-account-helper.mjs'),
  vimCommand: '/usr/bin/true',
})
