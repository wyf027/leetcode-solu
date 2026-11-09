import { describe, expect, it, vi } from 'vitest'

import { createChineseProblemCatalog } from '../../src/infrastructure/chineseProblemCatalog'

describe('ChineseProblemCatalog daily problem', () => {
  it('loads and normalizes the current daily problem', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            todayRecord: [
              {
                question: {
                  questionFrontendId: '1606',
                  title: 'Find Servers That Handled Most Number of Requests',
                  titleSlug: 'find-servers-that-handled-most-number-of-requests',
                  translatedTitle: '找到处理最多请求的服务器',
                },
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const catalog = createChineseProblemCatalog({ fetchImpl })

    await expect(catalog.loadDailyProblem()).resolves.toEqual({
      frontendId: '1606',
      originalTitle: 'Find Servers That Handled Most Number of Requests',
      slug: 'find-servers-that-handled-most-number-of-requests',
      title: '找到处理最多请求的服务器',
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      query: expect.stringContaining('questionOfToday'),
    })
  })

  it('returns no daily problem when the service has no record', async () => {
    const catalog = createChineseProblemCatalog({
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({ data: { todayRecord: [] } }), { status: 200 }),
        ),
    })

    await expect(catalog.loadDailyProblem()).resolves.toBeNull()
  })
})
