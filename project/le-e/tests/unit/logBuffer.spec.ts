import { describe, expect, it } from 'vitest'

import { appendLogEntries } from '../../src/application/logBuffer'
import type { LogEntry } from '../../src/application/logBuffer'

describe('appendLogEntries', () => {
  it('keeps a bounded tail in insertion order', () => {
    const entries: LogEntry[] = Array.from({ length: 505 }, (_, index) => ({
      id: index + 1,
      timestamp: index,
      level: 'info',
      message: `line ${index + 1}`,
    }))

    const bounded = appendLogEntries([], entries)

    expect(bounded).toHaveLength(500)
    expect(bounded[0]?.id).toBe(6)
    expect(bounded.at(-1)?.id).toBe(505)
  })

  it('returns a fresh list and supports a smaller explicit limit', () => {
    const original: LogEntry[] = []
    const next = appendLogEntries(
      original,
      [
        { id: 1, timestamp: 1, level: 'info', message: 'one' },
        { id: 2, timestamp: 2, level: 'error', message: 'two' },
      ],
      1,
    )

    expect(next.map(({ id }) => id)).toEqual([2])
    expect(original).toEqual([])
  })
})
