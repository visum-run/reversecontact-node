import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APIConnectionError, Page } from '../src'
import { collect, failure, mockClient, ok } from './helpers'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const CREATE = { items: [{ email: 'jane@example.com' }] }

function line(row: number): object {
  return {
    row,
    input: { email: `p${row}@example.com` },
    status: 'enriched',
    message: 'Enriched (1 credit)',
    creditsConsumed: 1,
    person: null,
    isFullProfile: false
  }
}

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

  it('gives the NDJSON results as text when asked for them', async () => {
    const body = `${JSON.stringify(line(1))}\n${JSON.stringify(line(2))}\n`
    const { client, calls } = mockClient([
      new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } })
    ])
    const text = await client.bulk.results('b', { format: 'ndjson' })
    expect(text).toBe(body)
    expect(
      text
        .trim()
        .split('\n')
        .map(value => JSON.parse(value).row)
    ).toEqual([1, 2])
    expect(calls[0]?.url.pathname).toBe('/v2/jobs/b/results')
    expect(calls[0]?.url.searchParams.get('format')).toBe('ndjson')
  })

  it('reads one page of rows with its cursor, limit and job status', async () => {
    const { client, calls } = mockClient([
      ok({ items: [line(3), line(4)], nextCursor: 'after-4', status: 'running' }),
      ok({ items: [line(5)], nextCursor: null, status: 'completed' })
    ])
    const rows = await client.bulk.rows('job /1', { cursor: 'after-2', limit: 2 })
    expect(rows).toBeInstanceOf(Page)
    expect(rows.data.map(item => item.row)).toEqual([3, 4])
    expect(rows.nextCursor).toBe('after-4')
    expect(rows.extras.status).toBe('running')
    expect(calls[0]?.url.pathname).toBe('/v2/jobs/job%20%2F1/rows')
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({
      cursor: 'after-2',
      limit: '2'
    })
    const next = await rows.getNextPage()
    expect(next?.data.map(item => item.row)).toEqual([5])
    expect(next?.hasNextPage()).toBe(false)
    expect(Object.fromEntries(calls[1]?.url.searchParams ?? [])).toEqual({
      cursor: 'after-4',
      limit: '2'
    })
  })

  it('iterates the rows across pages, waiting on an empty page and reading its cursor again', async () => {
    const { client, calls } = mockClient([
      ok({ items: [line(1), line(2)], nextCursor: 'at-3', status: 'running' }),
      ok({ items: [], nextCursor: 'at-3', status: 'running' }, { 'Retry-After': '5' }),
      ok({ items: [], nextCursor: 'at-3', status: 'running' }),
      ok({ items: [line(3)], nextCursor: 'at-4', status: 'running' }),
      ok({ items: [line(4)], nextCursor: null, status: 'completed' })
    ])
    const rows = collect(client.bulk.iterateRows('b', { limit: 2 }))
    await vi.runAllTimersAsync()
    expect((await rows).map(item => item.row)).toEqual([1, 2, 3, 4])
    expect(calls.map(call => call.url.pathname)).toEqual(Array(5).fill('/v2/jobs/b/rows'))
    expect(calls.map(call => call.url.searchParams.get('cursor'))).toEqual([
      null,
      'at-3',
      'at-3',
      'at-3',
      'at-4'
    ])
    expect(calls.every(call => call.url.searchParams.get('limit') === '2')).toBe(true)
    expect((calls[2]?.started ?? 0) - (calls[1]?.started ?? 0)).toBe(5000)
    expect((calls[3]?.started ?? 0) - (calls[2]?.started ?? 0)).toBe(2000)
    expect((calls[4]?.started ?? 0) - (calls[3]?.started ?? 0)).toBe(0)
  })

  it('retries a page of rows the server is too busy to read, after Retry-After', async () => {
    const { client, calls } = mockClient([
      failure(429, 'JOB_ROWS_BUSY', { retryAfter: 1 }, { 'Retry-After': '1' }),
      ok({ items: [line(1)], nextCursor: null, status: 'completed' })
    ])
    const rows = client.bulk.rows('b')
    await vi.runAllTimersAsync()
    expect((await rows).data).toHaveLength(1)
    expect(calls).toHaveLength(2)
    expect((calls[1]?.started ?? 0) - (calls[0]?.started ?? 0)).toBe(1000)
  })

  it('stops iterating the rows of a paused job without waiting', async () => {
    const { client, calls } = mockClient([
      ok({ items: [line(1)], nextCursor: 'at-2', status: 'running' }),
      ok({ items: [], nextCursor: 'at-2', status: 'paused' }, { 'Retry-After': '2' })
    ])
    const rows = await collect(client.bulk.iterateRows('b'))
    expect(rows.map(item => item.row)).toEqual([1])
    expect(calls).toHaveLength(2)
    expect(calls[1]?.started).toBe(calls[0]?.started)
  })

  it('stops iterating the rows once nextCursor is null, even on an empty page', async () => {
    const { client, calls } = mockClient([ok({ items: [], nextCursor: null, status: 'failed' })])
    expect(await collect(client.bulk.iterateRows('b'))).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('stops waiting for the next row when the signal aborts', async () => {
    const controller = new AbortController()
    const { client, calls } = mockClient([
      ok({ items: [], nextCursor: 'at-1', status: 'queued' }, { 'Retry-After': '2' })
    ])
    const rows = collect(client.bulk.iterateRows('b', {}, { signal: controller.signal }))
    const settled = expect(rows).rejects.toBeInstanceOf(APIConnectionError)
    await vi.advanceTimersByTimeAsync(1000)
    controller.abort()
    await settled
    expect(calls).toHaveLength(1)
  })
})
