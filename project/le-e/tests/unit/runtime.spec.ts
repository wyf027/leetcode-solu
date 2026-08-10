import { describe, expect, it } from 'vitest'

import { RUNTIME_CONFIG } from '../../src/config/runtime'

describe('RUNTIME_CONFIG', () => {
  it('keeps the approved terminal and language contract', () => {
    expect(RUNTIME_CONFIG).toMatchObject({
      language: 'javascript',
      minimumColumns: 100,
      minimumRows: 28,
      logLineLimit: 500,
    })
  })

  it('bounds subprocess time and captured output', () => {
    expect(RUNTIME_CONFIG.timeoutsMs).toEqual({
      standard: 30_000,
      remote: 120_000,
      cancellationGrace: 2_000,
    })
    expect(RUNTIME_CONFIG.outputLimits).toEqual({
      lineBytes: 4 * 1024,
      streamBytes: 1024 * 1024,
    })
  })
})
