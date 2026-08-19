import { htmlToTerminalMarkdown } from './problemStatement'

const GRAPHQL_ENDPOINT = 'https://leetcode.cn/graphql/'
const PAGE_SIZE = 100
const PAGE_CONCURRENCY = 6
const MAX_PAGES = 60
const REQUEST_TIMEOUT_MS = 15_000

const QUESTION_LIST_QUERY = `
  query problemsetQuestionListV2($categorySlug: String, $limit: Int, $skip: Int) {
    problemsetQuestionListV2(categorySlug: $categorySlug, limit: $limit, skip: $skip) {
      hasMore
      questions {
        questionFrontendId
        title
        titleSlug
        translatedTitle
      }
    }
  }
`

const QUESTION_DETAIL_QUERY = `
  query getQuestionTranslation($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      translatedTitle
      translatedContent
    }
  }
`

export interface ChineseProblemSummary {
  readonly id: number
  readonly originalTitle: string
  readonly title: string
  readonly slug: string
}

export interface ChineseProblemDetail {
  readonly originalTitle: string
  readonly title: string
  readonly statement: string
}

export interface ChineseProblemCatalog {
  list(signal?: AbortSignal): Promise<ReadonlyMap<number, ChineseProblemSummary>>
  loadDetail(id: number, signal?: AbortSignal): Promise<ChineseProblemDetail | null>
}

interface ChineseProblemCatalogOptions {
  readonly fetchImpl?: typeof fetch
}

interface QuestionListPage {
  readonly hasMore: boolean
  readonly questions: readonly ChineseProblemSummary[]
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal])
}

function numericProblemId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function createChineseProblemCatalog({
  fetchImpl = fetch,
}: ChineseProblemCatalogOptions = {}): ChineseProblemCatalog {
  let catalogPromise: Promise<ReadonlyMap<number, ChineseProblemSummary>> | null = null

  const postGraphql = async (query: string, variables: object, signal?: AbortSignal) => {
    const response = await fetchImpl(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: requestSignal(signal),
    })
    if (!response.ok) throw new Error(`LeetCode CN returned HTTP ${response.status}.`)
    const payload: unknown = await response.json()
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('LeetCode CN returned an invalid JSON payload.')
    }
    const errors = Reflect.get(payload, 'errors')
    if (Array.isArray(errors) && errors.length > 0) {
      throw new Error('LeetCode CN returned a GraphQL error.')
    }
    return Reflect.get(payload, 'data')
  }

  const loadPage = async (page: number, signal?: AbortSignal): Promise<QuestionListPage> => {
    const data = await postGraphql(
      QUESTION_LIST_QUERY,
      { categorySlug: 'all-code-essentials', limit: PAGE_SIZE, skip: page * PAGE_SIZE },
      signal,
    )
    const root =
      typeof data === 'object' && data !== null
        ? Reflect.get(data, 'problemsetQuestionListV2')
        : null
    const rawQuestions =
      typeof root === 'object' && root !== null ? Reflect.get(root, 'questions') : null
    if (!Array.isArray(rawQuestions)) throw new Error('LeetCode CN question list was missing.')

    const questions: ChineseProblemSummary[] = []
    for (const item of rawQuestions) {
      if (typeof item !== 'object' || item === null) continue
      const id = numericProblemId(Reflect.get(item, 'questionFrontendId'))
      const originalTitle = Reflect.get(item, 'title')
      const title = Reflect.get(item, 'translatedTitle')
      const slug = Reflect.get(item, 'titleSlug')
      if (
        id === null ||
        typeof originalTitle !== 'string' ||
        originalTitle === '' ||
        typeof title !== 'string' ||
        title === '' ||
        typeof slug !== 'string'
      ) {
        continue
      }
      questions.push({ id, originalTitle, title, slug })
    }
    return {
      hasMore: Boolean(typeof root === 'object' && root !== null && Reflect.get(root, 'hasMore')),
      questions,
    }
  }

  const loadCatalog = async (signal?: AbortSignal) => {
    const problems = new Map<number, ChineseProblemSummary>()
    for (let firstPage = 0; firstPage < MAX_PAGES; firstPage += PAGE_CONCURRENCY) {
      const pages = await Promise.all(
        Array.from({ length: PAGE_CONCURRENCY }, (_, offset) =>
          loadPage(firstPage + offset, signal),
        ),
      )
      for (const page of pages) {
        for (const problem of page.questions) problems.set(problem.id, problem)
      }
      if (pages.some((page) => !page.hasMore)) break
    }
    return problems
  }

  const list = (signal?: AbortSignal) => {
    catalogPromise ??= loadCatalog(signal).catch((error) => {
      catalogPromise = null
      throw error
    })
    return catalogPromise
  }

  return {
    list,
    async loadDetail(id, signal) {
      const problem = (await list(signal)).get(id)
      if (problem === undefined) return null
      const data = await postGraphql(QUESTION_DETAIL_QUERY, { titleSlug: problem.slug }, signal)
      const question =
        typeof data === 'object' && data !== null ? Reflect.get(data, 'question') : null
      if (typeof question !== 'object' || question === null) return null
      const title = Reflect.get(question, 'translatedTitle')
      const content = Reflect.get(question, 'translatedContent')
      if (
        typeof title !== 'string' ||
        title === '' ||
        typeof content !== 'string' ||
        content === ''
      ) {
        return null
      }
      return {
        originalTitle: problem.originalTitle,
        title,
        statement: await htmlToTerminalMarkdown(content, fetchImpl, signal),
      }
    },
  }
}
