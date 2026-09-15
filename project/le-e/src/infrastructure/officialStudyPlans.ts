const GRAPHQL_URL = 'https://leetcode.cn/graphql/'
const REQUEST_TIMEOUT_MS = 15_000
const PAGE_SIZE = 100
export class OfficialStudyPlanAccessError extends Error {}

const CATALOGS_QUERY = `
  query OfficialStudyPlanCatalogs {
    studyPlanV2Catalogs {
      slug
    }
  }
`

const PLANS_QUERY = `
  query OfficialStudyPlans($catalogSlug: String!, $offset: Int!, $limit: Int!) {
    studyPlansV2ByCatalog(catalogSlug: $catalogSlug, offset: $offset, limit: $limit) {
      hasMore
      studyPlans {
        slug
        name
        questionNum
        premiumOnly
      }
    }
  }
`

const PLAN_QUERY = `
  query OfficialStudyPlan($slug: String!) {
    studyPlanV2Detail(planSlug: $slug) {
      slug
      name
      questionNum
      premiumOnly
      description
      planSubGroups {
        questions {
          title
          titleSlug
        }
      }
    }
  }
`

export interface OfficialStudyPlanQuestion {
  readonly title: string
  readonly slug: string
}

export interface OfficialStudyPlan {
  readonly slug: string
  readonly name: string
  readonly writable: false
  readonly questions: readonly OfficialStudyPlanQuestion[]
  readonly questionCount: number
  readonly description?: string
  readonly premium?: boolean
}

export interface OfficialStudyPlansGateway {
  list(signal?: AbortSignal): Promise<readonly OfficialStudyPlan[]>
  load(slug: string, signal?: AbortSignal): Promise<OfficialStudyPlan>
}

export interface CreateOfficialStudyPlansGatewayOptions {
  readonly fetchImpl?: typeof fetch
}

type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function invalidResponse(): never {
  throw new Error('Official study plans returned invalid data.')
}

function planFromList(value: unknown): OfficialStudyPlan {
  const plan = record(value)
  if (plan === null) return invalidResponse()
  const slug = nonEmptyString(plan.slug)
  const name = nonEmptyString(plan.name)
  const questionCount = nonNegativeInteger(plan.questionNum)
  if (
    slug === null ||
    !validSlug(slug) ||
    name === null ||
    questionCount === null ||
    typeof plan.premiumOnly !== 'boolean'
  ) {
    return invalidResponse()
  }
  return {
    slug,
    name,
    writable: false,
    questions: [],
    questionCount,
    premium: plan.premiumOnly,
  }
}

function planFromDetail(value: unknown): OfficialStudyPlan {
  const plan = record(value)
  if (plan === null) return invalidResponse()
  const slug = nonEmptyString(plan.slug)
  const name = nonEmptyString(plan.name)
  const questionCount = nonNegativeInteger(plan.questionNum)
  const groups = plan.planSubGroups
  if (
    slug === null ||
    name === null ||
    questionCount === null ||
    typeof plan.premiumOnly !== 'boolean' ||
    !Array.isArray(groups) ||
    (plan.description !== null &&
      plan.description !== undefined &&
      typeof plan.description !== 'string')
  ) {
    return invalidResponse()
  }
  const questions: OfficialStudyPlanQuestion[] = []
  for (const groupValue of groups) {
    const group = record(groupValue)
    if (group === null || !Array.isArray(group.questions)) return invalidResponse()
    for (const questionValue of group.questions) {
      const question = record(questionValue)
      const title = question === null ? null : nonEmptyString(question.title)
      const questionSlug = question === null ? null : nonEmptyString(question.titleSlug)
      if (title === null || questionSlug === null || !validSlug(questionSlug))
        return invalidResponse()
      questions.push({ title, slug: questionSlug })
    }
  }
  // Some plans expose only part of their groups publicly, even without premiumOnly.
  // Preserve the authoritative total so callers can disclose partial access.
  if (questions.length > questionCount) return invalidResponse()
  return {
    slug,
    name,
    writable: false,
    questions,
    questionCount,
    ...(typeof plan.description === 'string' && plan.description !== ''
      ? { description: plan.description }
      : {}),
    premium: plan.premiumOnly,
  }
}

function validSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 200 && /^[a-z0-9-]+$/i.test(slug)
}

async function graphql(
  fetchImpl: typeof fetch,
  query: string,
  variables: RecordValue,
  signal?: AbortSignal,
): Promise<RecordValue> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const request = signal ? AbortSignal.any([signal, timeout]) : timeout
  request.throwIfAborted()
  try {
    const response = await fetchImpl(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: request,
    })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw new OfficialStudyPlanAccessError('Official study plan access is unavailable.')
      throw new Error('Official study plans request failed.')
    }
    const payload = record(await response.json())
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      if (
        payload.errors.some((error) =>
          /unauthenticated|unauthorized|forbidden|permission|premium|login|登录|权限|会员/i.test(
            JSON.stringify(error),
          ),
        )
      )
        throw new OfficialStudyPlanAccessError('Official study plan access is unavailable.')
      return invalidResponse()
    }
    const data = payload === null ? null : record(payload.data)
    if (data === null) {
      return invalidResponse()
    }
    return data
  } catch (error) {
    if (request.aborted && !signal?.aborted) {
      throw new Error('Official study plans request timed out.')
    }
    if (signal?.aborted) throw error
    if (error instanceof Error) throw error
    throw new Error('Official study plans request failed.')
  }
}

export function createOfficialStudyPlansGateway({
  fetchImpl = fetch,
}: CreateOfficialStudyPlansGatewayOptions = {}): OfficialStudyPlansGateway {
  return {
    async list(signal) {
      const catalogData = await graphql(fetchImpl, CATALOGS_QUERY, {}, signal)
      const catalogs = catalogData.studyPlanV2Catalogs
      if (!Array.isArray(catalogs)) return invalidResponse()
      const plans: OfficialStudyPlan[] = []
      const seen = new Set<string>()
      for (const catalogValue of catalogs) {
        const catalog = record(catalogValue)
        const catalogSlug = catalog === null ? null : nonEmptyString(catalog.slug)
        if (catalogSlug === null || !validSlug(catalogSlug)) return invalidResponse()
        let offset = 0
        for (;;) {
          if (offset >= 10_000) return invalidResponse()
          const data = await graphql(
            fetchImpl,
            PLANS_QUERY,
            { catalogSlug, offset, limit: PAGE_SIZE },
            signal,
          )
          const page = record(data.studyPlansV2ByCatalog)
          const entries = page === null ? null : page.studyPlans
          if (page === null || !Array.isArray(entries) || typeof page.hasMore !== 'boolean') {
            return invalidResponse()
          }
          for (const entry of entries) {
            const plan = planFromList(entry)
            if (!seen.has(plan.slug)) {
              seen.add(plan.slug)
              plans.push(plan)
            }
          }
          if (!page.hasMore) break
          if (entries.length === 0) return invalidResponse()
          offset += entries.length
        }
      }
      return plans
    },
    async load(slug, signal) {
      if (!validSlug(slug)) throw new Error('Official study plan slug is invalid.')
      const data = await graphql(fetchImpl, PLAN_QUERY, { slug }, signal)
      if (data.studyPlanV2Detail === null) {
        throw new OfficialStudyPlanAccessError(
          'Official study plan requires access or was not found.',
        )
      }
      const plan = planFromDetail(data.studyPlanV2Detail)
      if (plan.slug !== slug) return invalidResponse()
      return plan
    },
  }
}
