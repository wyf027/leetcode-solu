import { describe, expect, it } from 'vitest'

import { cookieTokenFieldTitle, maskTokenInput } from '../../src/components/cookieLoginDisplay'

describe('maskTokenInput', () => {
  it('shows only a bounded mask and never the token value', () => {
    expect(maskTokenInput(0, 12)).toBe('粘贴 Token...')
    expect(maskTokenInput(5, 12)).toBe('•••••')
    expect(maskTokenInput(20, 8)).toBe('••••••••')
  })

  it('marks only the active token field', () => {
    expect(cookieTokenFieldTitle('LEETCODE_SESSION', true)).toBe('> LEETCODE_SESSION')
    expect(cookieTokenFieldTitle('csrftoken', false)).toBe('csrftoken')
  })
})
