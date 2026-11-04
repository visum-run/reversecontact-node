import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { failure, mockClient, ok } from './helpers'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const CREATE = { items: [{ email: 'jane@example.com' }] }

describe('bulk', () => {
  it('reuses its generated idempotency key across retries and creates a fresh one per call', async () => {
    const { client, calls } = mockClient([failure(503), ok({ job: { id: 'one' } }), ok()])
    const result = client.bulk.enrichPersons(CREATE)
    await vi.runAllTimersAsync()
    await result
    await client.bulk.enrichPersons(CREATE)
    const keys = calls.map(call => new Headers(call.init.headers).get('Idempotency-Key'))
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])
  })

  it('submits to the bulk route of the unit endpoint and follows the job under /v2/jobs', async () => {
    const { client, calls } = mockClient([ok({ job: { id: 'one' } }), ok({ id: 'one' })])
    await client.bulk.enrichPersons(CREATE)
    await client.bulk.retrieve('one')
    expect(calls.map(call => new URL(call.url).pathname)).toEqual([
      '/v2/enrich/persons/bulk',
      '/v2/jobs/one'
    ])
  })

  it('uses a caller-provided idempotency key', async () => {
    const { client, calls } = mockClient([ok()])
    await client.bulk.enrichPersons(CREATE, { idempotencyKey: 'caller-key' })
    expect(new Headers(calls[0]?.init.headers).get('Idempotency-Key')).toBe('caller-key')
  })

  it('waits while the job is queued or running, paced by Retry-After', async () => {
    const { client, calls } = mockClient([
      ok({ id: 'b', status: 'queued' }, { 'Retry-After': '3' }),
      ok({ id: 'b', status: 'running' }),
      ok({ id: 'b', status: 'completed' })
    ])
    const result = client.bulk.wait('b', { pollWait: 10 })
    await vi.runAllTimersAsync()
    expect((await result).data.status).toBe('completed')
    expect(calls).toHaveLength(3)
    expect(calls[0]?.url.pathname).toBe('/v2/jobs/b')
    expect(calls[0]?.url.searchParams.get('wait')).toBe('10')
    expect((calls[1]?.started ?? 0) - (calls[0]?.started ?? 0)).toBe(3000)
    expect((calls[2]?.started ?? 0) - (calls[1]?.started ?? 0)).toBe(2000)
  })

  it.each([
    'paused',
    'cancelled',
    'failed'
  ])('returns a %s job without polling again', async status => {
    const { client, calls } = mockClient([ok({ id: 'b', status })])
    const result = await client.bulk.wait('b')
    expect(result.data.status).toBe(status)
    expect(calls).toHaveLength(1)
  })

  it('iterates the history page by page', async () => {
    const { client, calls } = mockClient([
      ok({ items: [{ id: 'one' }, { id: 'two' }], nextCursor: 'next' }),
      ok({ items: [{ id: 'three' }], nextCursor: null })
    ])
    const ids: string[] = []
    for await (const job of client.bulk.listAll({ type: 'enrich_persons', perPage: 2 }))
      ids.push(job.id)
    expect(ids).toEqual(['one', 'two', 'three'])
    expect(calls[1]?.url.searchParams.get('cursor')).toBe('next')
    expect(calls[1]?.url.searchParams.get('type')).toBe('enrich_persons')
  })

  it('gives the results CSV as text', async () => {
    const body = 'email,externalId,rc_status\r\na@b.co,1,enriched\r\n'
    const { client, calls } = mockClient([
      new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } })
    ])
    expect(await client.bulk.results('b')).toBe(body)
    expect(calls[0]?.url.pathname).toBe('/v2/jobs/b/results')
  })
})
