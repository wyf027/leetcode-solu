const [mode, ...args] = process.argv.slice(2)

switch (mode) {
  case 'echo': {
    process.stdout.write(args[0] ?? '')
    process.stderr.write(args[1] ?? '')
    break
  }
  case 'wait': {
    setTimeout(() => process.stdout.write('done'), Number(args[0] ?? 1_000))
    break
  }
  case 'ignore-term': {
    process.on('SIGTERM', () => {})
    setInterval(() => {}, 1_000)
    break
  }
  case 'flood': {
    process.stdout.write('x'.repeat(Number(args[0] ?? 10_000)))
    setTimeout(() => {}, 1_000)
    break
  }
  case 'silent-exit': {
    process.exit(Number(args[0] ?? 0))
    break
  }
  default: {
    process.stderr.write(`unknown fixture mode: ${mode ?? ''}`)
    process.exit(64)
  }
}
