export interface LeetCodeSessionTokens {
  readonly session: string
  readonly csrf: string
}

export type SessionTokenValidationResult =
  | { readonly ok: true; readonly value: LeetCodeSessionTokens }
  | { readonly ok: false; readonly error: string }

export interface SessionTokenStore {
  configure(session: string, csrf: string): SessionTokenValidationResult
  clear(): void
  environment(): Readonly<Record<string, string>> | undefined
}

export function createSessionTokenStore(): SessionTokenStore {
  let currentEnvironment: Readonly<Record<string, string>> | undefined
  return {
    configure(session, csrf) {
      const validated = validateLeetCodeSessionTokens(session, csrf)
      if (!validated.ok) {
        currentEnvironment = undefined
        return validated
      }
      currentEnvironment = {
        LEETCODE_SESSION: validated.value.session,
        LEETCODE_CSRF: validated.value.csrf,
        LEETCODE_SITE: 'leetcode.cn',
      }
      return validated
    },
    clear() {
      currentEnvironment = undefined
    },
    environment() {
      return currentEnvironment
    },
  }
}

const containsControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || codePoint === 0x7f
  })

export function validateLeetCodeSessionTokens(
  session: string,
  csrf: string,
): SessionTokenValidationResult {
  const normalizedSession = session.trim()
  const normalizedCsrf = csrf.trim()
  return normalizedSession === '' ||
    normalizedCsrf === '' ||
    containsControlCharacter(normalizedSession) ||
    containsControlCharacter(normalizedCsrf)
    ? { ok: false, error: '请分别填写 LEETCODE_SESSION 和 csrftoken。' }
    : { ok: true, value: { session: normalizedSession, csrf: normalizedCsrf } }
}
