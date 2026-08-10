export const RUNTIME_CONFIG = {
  language: 'javascript',
  minimumColumns: 100,
  minimumRows: 28,
  logLineLimit: 500,
  timeoutsMs: {
    standard: 30_000,
    remote: 120_000,
    cancellationGrace: 2_000,
  },
  editorBridgeHandshakeMs: 5_000,
  outputLimits: {
    lineBytes: 4 * 1024,
    streamBytes: 1024 * 1024,
  },
  sourceFileLimitBytes: 1024 * 1024,
} as const
