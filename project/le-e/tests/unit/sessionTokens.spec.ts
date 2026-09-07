import { describe, expect, it } from 'vitest'

import {
  createSessionTokenStore,
  validateLeetCodeSessionTokens,
} from '../../src/infrastructure/sessionTokens'

describe('validateLeetCodeSessionTokens', () => {
  it('accepts and trims separate session and CSRF token values', () => {
    expect(validateLeetCodeSessionTokens(' session-example== ', ' csrf-example ')).toEqual({
      ok: true,
      value: {
        session: 'session-example==',
        csrf: 'csrf-example',
      },
    })
  })

  it('rejects an incomplete pair without echoing either supplied value', () => {
    const result = validateLeetCodeSessionTokens('session-example', '')

    expect(result).toMatchObject({ ok: false })
    expect(JSON.stringify(result)).not.toContain('session-example')
  })

  it('rejects control characters without echoing the supplied token', () => {
    const result = validateLeetCodeSessionTokens('session\u0000example', 'csrf-example')

    expect(result).toMatchObject({ ok: false })
    expect(JSON.stringify(result)).not.toContain('session')
    expect(JSON.stringify(result)).not.toContain('csrf-example')
  })
})

describe('createSessionTokenStore', () => {
  it('shares a validated environment until it is cleared', () => {
    const store = createSessionTokenStore()

    expect(store.environment()).toBeUndefined()
    expect(store.configure('session-example', 'csrf-example')).toMatchObject({ ok: true })
    expect(store.environment()).toEqual({
      LEETCODE_SESSION: 'session-example',
      LEETCODE_CSRF: 'csrf-example',
      LEETCODE_SITE: 'leetcode.cn',
    })

    store.clear()
    expect(store.environment()).toBeUndefined()
  })
})
