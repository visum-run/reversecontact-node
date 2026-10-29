import { vi } from 'vitest'
import ReverseContact, { type ClientOptions, type Fetch } from '../src'

export const metadata = { requestId: 'req_test', executionTimeMs: 0 }
export const quotas = {
  creditsConsumed: 0,
  workspace: {
    id: 'workspace',
    credits: { total: null, used: 0, left: null },
    hasUnlimitedCredits: null,
    allowDailyOvercost: null,
    minuteRateLimit: null,
    dailyLimit: null
  },
  key: null
}
export function ok(data: unknown = null, headers?: HeadersInit, status = 200): Response {
  return Response.json({ success: true, data, error: null, quotas, metadata }, { status, headers })
}
export function failure(
  status: number,
  code = 'REQUEST_ERROR',
  details?: unknown,
  headers?: HeadersInit
): Response {
  return Response.json(
    { success: false, data: null, error: { code, message: 'An API error', details }, metadata },
    { status, headers }
  )
}
export function mockClient(
  responses: (Response | Error | (() => Promise<Response>))[],
  options: ClientOptions = {}
): {
  client: ReverseContact
  fetch: ReturnType<typeof vi.fn<Fetch>>
  calls: { url: URL; init: RequestInit; started: number }[]
} {
  const calls: { url: URL; init: RequestInit; started: number }[] = []
  const fetch = vi.fn<Fetch>(async (input, init = {}) => {
    calls.push({ url: new URL(String(input)), init, started: Date.now() })
    const response = responses.shift()
    if (!response) throw new Error('Unexpected mock request')
    if (response instanceof Error) throw response
    return typeof response === 'function' ? response() : response
  })
  return { client: new ReverseContact({ apiKey: 'rc_test', fetch, ...options }), fetch, calls }
}
export function searchPage(
  count: number,
  nextCursor: string | null = null,
  extra: object = {}
): Response {
  return ok({
    data: Array.from({ length: count }, (_, index) => ({ id: `prs_${index}` })),
    metadata: { count, perPage: count, nextCursor },
    ...extra
  })
}
export function job(status = 'in_progress', extra: object = {}, headers?: HeadersInit): Response {
  return ok(
    {
      webhookId: 'job-id',
      status,
      result: null,
      errorCode: null,
      eventType: 'FETCH_PERSON_DATA',
      createdAt: '2026-10-28T00:00:00Z',
      creditsConsumed: 0,
      ...extra
    },
    headers
  )
}
export async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = []
  for await (const item of items) results.push(item)
  return results
}
