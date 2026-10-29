import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APIConnectionError } from '../src'
import { Transport } from '../src/core/http'
import { failure, mockClient, ok } from './helpers'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  vi.stubEnv('RC_LOG', '')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function broken(status: number, headers?: RequestInit['headers']): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error('Body interrupted'))
      }
    }),
    { status, headers }
  )
}

describe('safe transport retries', () => {
  it.each(['GET', 'DELETE'])('retries %s failures before headers', async method => {
    const { fetch, calls } = mockClient([new TypeError('network'), ok()])
    const transport = new Transport({ apiKey: 'test', fetch })
    const result = transport.request(method, '/test', undefined)
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(2)
  })
  it.each([
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'UND_ERR_CONNECT_TIMEOUT'
  ])('retries a POST only when %s proves it never connected', async code => {
    const { client, calls } = mockClient([new TypeError('fetch failed', { cause: { code } }), ok()])
    const result = client.search.countPeople({ firstName: 'Jane' })
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(2)
  })
  it.each([
    undefined,
    'ECONNRESET',
    'UND_ERR_SOCKET',
    'UND_ERR_HEADERS_TIMEOUT'
  ])('does not replay ambiguous POST failure %s', async code => {
    const cause = new TypeError('fetch failed', { cause: { code } })
    const { client, calls } = mockClient([cause])
    await expect(
      client.fetch.personLive({ url: 'https://social.com/in/jane' })
    ).rejects.toMatchObject({ name: 'APIConnectionError', cause })
    expect(calls).toHaveLength(1)
  })
  it.each(['POST', 'DELETE'])('does not replay %s after a broken 200 body', async method => {
    const { fetch, calls } = mockClient([broken(200)])
    const transport = new Transport({ apiKey: 'test', fetch })
    await expect(transport.request(method, '/test', {})).rejects.toMatchObject({
      name: 'APIConnectionError',
      status: 200
    })
    expect(calls).toHaveLength(1)
  })
  it('retries GET after a broken 200 body', async () => {
    const { client, calls } = mockClient([broken(200), ok()])
    const result = client.usage.retrieve()
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(2)
  })
  it.each([
    401, 404
  ])('preserves HTTP %i and never replays an unreadable error body', async status => {
    const { client, calls } = mockClient([broken(status)])
    await expect(client.enrich.person({ email: 'jane@example.com' })).rejects.toMatchObject({
      status,
      code: `HTTP_${status}`
    })
    expect(calls).toHaveLength(1)
  })
  it.each([
    429, 500, 502, 503, 504
  ])('applies HTTP %i retry rules to an unreadable POST response', async status => {
    const { client, calls } = mockClient([broken(status, { 'Retry-After': '1' }), ok()])
    const result = client.search.countPeople({ firstName: 'Jane' })
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(2)
    expect((calls[1]?.started ?? 0) - (calls[0]?.started ?? 0)).toBe(1000)
  })
  it.each([200, 401])('keeps status %i when a body stalls until timeout', async status => {
    const { client, calls } = mockClient([new Response(new ReadableStream(), { status })], {
      timeout: 10
    })
    const result = expect(
      client.fetch.personLive({ url: 'https://social.com/in/jane' })
    ).rejects.toMatchObject({ status })
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(1)
  })
  it.each([429, 500, 502, 503, 504])('never sleeps above 60 seconds on HTTP %i', async status => {
    for (const response of [
      failure(status, 'REQUEST_ERROR', undefined, { 'Retry-After': '61' }),
      failure(status, 'REQUEST_ERROR', { retryAfter: 61 }),
      failure(status, 'REQUEST_ERROR', { retryAfterSeconds: 61 }),
      failure(status, 'REQUEST_ERROR', { retryAfter: 1 }, { 'Retry-After': '61' })
    ]) {
      const { client, calls } = mockClient([response])
      await expect(client.usage.retrieve()).rejects.toMatchObject({ status })
      expect(calls).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(0)
    }
  })
  it('allows a retry delay of exactly 60 seconds', async () => {
    const { client, calls } = mockClient([
      failure(503, 'REQUEST_ERROR', { retryAfterSeconds: 60 }),
      ok()
    ])
    const result = client.usage.retrieve()
    await vi.runAllTimersAsync()
    await result
    expect((calls[1]?.started ?? 0) - (calls[0]?.started ?? 0)).toBe(60_000)
  })
})

describe('client copies and logging', () => {
  it('keeps request ids from broken responses and excludes query strings from logs', async () => {
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { client } = mockClient([broken(401, { 'X-Request-ID': 'req_broken' })], {
      logLevel: 'debug'
    })
    await expect(client.jobs.retrieve('id', { wait: 7 })).rejects.toMatchObject({
      status: 401
    })
    expect(log).toHaveBeenCalledWith('[ReverseContact]', {
      method: 'GET',
      path: '/v2/webhooks/id',
      status: 401,
      attempt: 1,
      delay: 0,
      requestId: 'req_broken'
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('wait=7')
  })
  it('shares fetch and snapshots options while keeping overrides isolated', async () => {
    const defaults = { 'X-Default': 'original', 'X-Request-Origin': 'forbidden' }
    const { client, calls, fetch } = mockClient([ok(), ok(), ok()], {
      defaultHeaders: defaults,
      baseUrl: 'https://original.test'
    })
    const copy = client.withOptions({
      apiKey: 'copy-key',
      baseUrl: 'https://copy.test',
      defaultHeaders: { 'X-Copy': 'yes', 'X-Request-Origin': 'forbidden-copy' }
    })
    defaults['X-Default'] = 'mutated'
    await copy.usage.retrieve({ headers: { 'X-Request-Origin': 'forbidden-request' } })
    await client.usage.retrieve()
    await copy.withOptions({ timeout: 1000 }).usage.retrieve()
    expect(copy).not.toBe(client)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(calls.map(call => call.url.origin)).toEqual([
      'https://copy.test',
      'https://original.test',
      'https://copy.test'
    ])
    const headers = calls.map(call => new Headers(call.init.headers))
    expect(headers.map(value => value.get('authorization'))).toEqual([
      'Bearer copy-key',
      'Bearer rc_test',
      'Bearer copy-key'
    ])
    expect(headers.map(value => value.get('x-copy'))).toEqual(['yes', null, 'yes'])
    for (const header of headers) {
      expect(header.has('X-Request-Origin')).toBe(false)
      expect(header.get('X-Default')).toBe('original')
    }
  })
  it('applies timeout and retry overrides without changing the original client', async () => {
    const { client, calls } = mockClient([() => new Promise(() => {}), failure(503), ok()])
    const copy = client.withOptions({ timeout: 10, maxRetries: 0 })
    const short = expect(copy.usage.retrieve()).rejects.toBeInstanceOf(APIConnectionError)
    await vi.advanceTimersByTimeAsync(10)
    await short
    expect(calls[0]?.init.signal?.aborted).toBe(true)
    const original = client.usage.retrieve()
    await vi.runAllTimersAsync()
    await original
    expect(calls).toHaveLength(3)
  })
  it('is silent by default and supports an explicit off override of RC_LOG', async () => {
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {})
    await mockClient([ok()]).client.usage.retrieve()
    vi.stubEnv('RC_LOG', 'debug')
    await mockClient([ok()], { logLevel: 'off' }).client.usage.retrieve()
    expect(log).not.toHaveBeenCalled()
  })
  it.each(['option', 'environment'])('logs safe request and retry fields via %s', async source => {
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {})
    if (source === 'environment') vi.stubEnv('RC_LOG', 'debug')
    const { client } = mockClient([failure(503), ok()], {
      apiKey: 'secret-api-key',
      logLevel: source === 'option' ? 'debug' : undefined,
      defaultHeaders: { 'X-Secret': 'private-header' }
    })
    const result = client.search.countPeople({ firstName: 'private-person' })
    await vi.runAllTimersAsync()
    await result
    expect(log.mock.calls).toEqual([
      [
        '[ReverseContact]',
        {
          method: 'POST',
          path: '/v2/search/people/count',
          status: 503,
          attempt: 1,
          delay: 2000,
          requestId: 'req_test'
        }
      ],
      [
        '[ReverseContact]',
        {
          method: 'POST',
          path: '/v2/search/people/count',
          status: 200,
          attempt: 2,
          delay: 0,
          requestId: 'req_test'
        }
      ]
    ])
    const output = JSON.stringify(log.mock.calls)
    for (const secret of ['secret-api-key', 'private-header', 'private-person'])
      expect(output).not.toContain(secret)
  })
})
