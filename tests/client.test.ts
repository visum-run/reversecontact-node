import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import packageJson from '../package.json'
import ReverseContact, {
  APIConnectionError,
  APIError,
  APITimeoutError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  DailyLimitError,
  GoneError,
  InsufficientCreditsError,
  InternalServerError,
  KeyCreditLimitError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ReverseContactError,
  UnavailableForLegalReasonsError,
  UnprocessableEntityError,
  VERSION
} from '../src'
import { retryDelay } from '../src/core/http'
import { failure, metadata, mockClient, ok, quotas } from './helpers'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('configuration and responses', () => {
  it('requires an API key at construction', () => {
    vi.stubEnv('RC_API_KEY', '')
    expect(() => new ReverseContact()).toThrow(ReverseContactError)
    expect(() => new ReverseContact()).toThrow('RC_API_KEY')
  })
  it('reads environment key and URL, merges headers, and reports its version', async () => {
    vi.stubEnv('RC_API_KEY', 'oat_test')
    vi.stubEnv('RC_BASE_URL', 'https://example.test///')
    const { client, calls } = mockClient([ok()], {
      apiKey: undefined,
      defaultHeaders: { 'X-Default': 'yes', 'X-Override': 'old', 'X-Request-Origin': 'ignored' }
    })
    const result = await client.usage.retrieve({ headers: { 'X-Override': 'new' } })
    const headers = new Headers(calls[0]?.init.headers)
    expect(calls[0]?.url.href).toBe('https://example.test/v2/usage')
    expect(headers.get('authorization')).toBe('Bearer oat_test')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-default')).toBe('yes')
    expect(headers.get('x-override')).toBe('new')
    expect(headers.has('x-request-origin')).toBe(false)
    expect(headers.get('user-agent')).toMatch(/^reversecontact-node\/0\.1\.0 \(node\//)
    expect(headers.get('user-agent')).not.toMatch(/\b(make|zapier)\b|reversecontact-cli/i)
    expect(VERSION).toBe(packageJson.version)
    expect(result.data).toBeNull()
    expect(result.quotas).toEqual(quotas)
    expect(result.metadata).toEqual(metadata)
    expect(result.response.status).toBe(200)
    expect(result.response.bodyUsed).toBe(true)
  })
  it('prefers explicit URL and app info without its URL', async () => {
    vi.stubEnv('RC_BASE_URL', 'https://ignored.test')
    const { client, calls } = mockClient([ok()], {
      baseUrl: 'https://custom.test/',
      appInfo: { name: 'my-app', version: '2', url: 'https://private.test' }
    })
    await client.usage.retrieve()
    expect(calls[0]?.url.origin).toBe('https://custom.test')
    const agent = new Headers(calls[0]?.init.headers).get('user-agent')
    expect(agent).toMatch(/ my-app\/2$/)
    expect(agent).not.toContain('private')
  })
  it('blocks browsers unless explicitly allowed', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {})
    expect(() => new ReverseContact({ apiKey: 'test' })).toThrow('server-side')
    expect(
      () => new ReverseContact({ apiKey: 'test', dangerouslyAllowBrowser: true })
    ).not.toThrow()
  })
  it('preserves unknown fields, nulls, empty arrays and zero', async () => {
    const data = {
      person: { firstName: null, skills: [], followersCount: 0, futureField: 'value' },
      isFullProfile: false
    }
    const { client } = mockClient([ok(data)])
    expect((await client.enrich.person({ email: 'jane@example.com' }))?.data).toEqual(data)
  })
  it('validates client timeout and retry settings', () => {
    expect(() => mockClient([], { timeout: 0 })).toThrow(ReverseContactError)
    expect(() => mockClient([], { maxRetries: -1 })).toThrow(ReverseContactError)
  })
})

describe('error mapping', () => {
  it.each([
    [400, BadRequestError],
    [401, AuthenticationError],
    [402, InsufficientCreditsError],
    [403, PermissionDeniedError],
    [404, NotFoundError],
    [409, ConflictError],
    [410, GoneError],
    [422, UnprocessableEntityError],
    [429, RateLimitError],
    [451, UnavailableForLegalReasonsError],
    [500, InternalServerError],
    [501, InternalServerError],
    [502, InternalServerError],
    [503, InternalServerError],
    [504, InternalServerError],
    [418, APIError]
  ])('maps HTTP %i and keeps support details', async (status, ErrorClass) => {
    const details = { errors: [{ field: 'perPage' }], suggestions: ['Use cursor'] }
    const { client } = mockClient(
      [failure(status, 'UNKNOWN_FUTURE_CODE', details, { 'X-Test': 'raw' })],
      { maxRetries: 0 }
    )
    const error: unknown = await client.usage.retrieve().catch(error => error)
    expect(error).toBeInstanceOf(ErrorClass)
    expect(error).toMatchObject({
      status,
      code: 'UNKNOWN_FUTURE_CODE',
      details,
      requestId: 'req_test',
      message: 'An API error'
    })
    if (!(error instanceof APIError)) throw new Error('Expected APIError')
    expect(error.headers.get('x-test')).toBe('raw')
    expect(error.body).toMatchObject({ error: { details } })
  })
  it('maps an HTML 502 without leaking JSON parse failures', async () => {
    const { client } = mockClient([new Response('<html>bad gateway</html>', { status: 502 })], {
      maxRetries: 0
    })
    await expect(client.usage.retrieve()).rejects.toMatchObject({
      name: 'InternalServerError',
      code: 'HTTP_502',
      message: 'The response is not JSON',
      body: '<html>bad gateway</html>'
    })
  })
  it('maps the non-envelope 410 tombstone', async () => {
    const alternative = { endpoint: '/v2/contact/email', docs: 'https://docs.reversecontact.com' }
    const { client } = mockClient([
      Response.json(
        { error: 'endpoint_unavailable', message: 'Unavailable', alternative },
        { status: 410 }
      )
    ])
    await expect(
      client.contact.findPhone({ url: 'https://social.com/in/janedoe' })
    ).rejects.toMatchObject({ name: 'GoneError', code: 'endpoint_unavailable', alternative })
  })
  it('accepts a gateway timeout without metadata or quotas', async () => {
    const { client } = mockClient(
      [
        Response.json(
          {
            error: { code: 'GATEWAY_TIMEOUT', message: 'Deadline', details: { deadlineMs: 62000 } }
          },
          { status: 504 }
        )
      ],
      { maxRetries: 0 }
    )
    await expect(client.usage.retrieve()).rejects.toMatchObject({
      name: 'InternalServerError',
      code: 'GATEWAY_TIMEOUT',
      requestId: undefined
    })
  })
  for (const operation of ['fetch.person', 'fetch.company', 'enrich.person', 'enrich.company']) {
    it(`${operation} returns null for no-match but throws for an unknown route`, async () => {
      const { client } = mockClient([failure(404), failure(404, 'NOT_FOUND')])
      const call = (): Promise<unknown> => {
        if (operation === 'fetch.person')
          return client.fetch.person({ url: 'https://social.com/in/janedoe' })
        if (operation === 'fetch.company')
          return client.fetch.company({ url: 'https://social.com/company/acme' })
        if (operation === 'enrich.person')
          return client.enrich.person({ email: 'jane@example.com' })
        return client.enrich.company({ domain: 'example.com' })
      }
      expect(await call()).toBeNull()
      await expect(call()).rejects.toBeInstanceOf(NotFoundError)
    })
  }
})

describe('retry and timeout policy', () => {
  it.each([
    ['header', failure(429, 'REQUEST_ERROR', undefined, { 'Retry-After': '3' }), 3000],
    [
      'details before header',
      failure(429, 'RATE_LIMIT_EXCEEDED', { retryAfter: 4 }, { 'Retry-After': '9' }),
      4000
    ],
    ['fallback', failure(429), 2000],
    ['zero seconds', failure(429, 'REQUEST_ERROR', { retryAfter: 0 }), 0],
    ['5xx header', failure(503, 'SERVICE_UNAVAILABLE', undefined, { 'Retry-After': '3' }), 3000],
    ['5xx details', failure(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 }), 5000]
  ])('retries using %s', async (_, response, delay) => {
    const { client, calls } = mockClient([response, ok()])
    const result = client.usage.retrieve()
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(2)
    expect((calls[1]?.started ?? 0) - (calls[0]?.started ?? 0)).toBe(delay)
  })
  it.each([
    'DAILY_LIMIT_EXCEEDED',
    'DAILY_EXTRACTION_LIMIT_EXCEEDED',
    'KEY_CREDIT_LIMIT_REACHED'
  ])('never retries %s', async code => {
    const { client, calls } = mockClient([
      failure(429, code, {
        retryAfter: 10,
        resetAt: 'tomorrow',
        period: 'daily',
        limit: 5,
        used: 5,
        required: 1
      })
    ])
    const error: unknown = await client.usage.retrieve().catch(error => error)
    expect(error).toBeInstanceOf(code.startsWith('KEY') ? KeyCreditLimitError : DailyLimitError)
    expect(error).toMatchObject({ retryAfter: 10, resetAt: 'tomorrow' })
    if (code.startsWith('KEY'))
      expect(error).toMatchObject({ period: 'daily', limit: 5, used: 5, required: 1 })
    expect(calls).toHaveLength(1)
  })
  it('maps the total key credit limit even on 403', async () => {
    const { client, calls } = mockClient([
      failure(403, 'KEY_CREDIT_LIMIT_REACHED', { period: 'total' })
    ])
    await expect(client.usage.retrieve()).rejects.toBeInstanceOf(KeyCreditLimitError)
    expect(calls).toHaveLength(1)
  })
  it('raises immediately when a 429 asks for more than 60 seconds', async () => {
    const { client, calls } = mockClient([
      failure(429, 'RATE_LIMIT_EXCEEDED', undefined, { 'Retry-After': '61' })
    ])
    await expect(client.usage.retrieve()).rejects.toMatchObject({ retryAfter: 61 })
    expect(calls).toHaveLength(1)
  })
  it('honours HTTP-date Retry-After', async () => {
    vi.setSystemTime(new Date('2026-10-28T00:00:00Z'))
    const { client, calls } = mockClient([
      failure(429, 'REQUEST_ERROR', undefined, { 'Retry-After': 'Wed, 28 Oct 2026 00:00:04 GMT' }),
      ok()
    ])
    const result = client.usage.retrieve()
    await vi.runAllTimersAsync()
    await result
    expect((calls[1]?.started ?? 0) - (calls[0]?.started ?? 0)).toBe(4000)
  })
  it('uses exponential 5xx backoff for five total attempts', async () => {
    const { client, calls } = mockClient([
      failure(500),
      failure(502),
      failure(503),
      failure(504),
      ok()
    ])
    const result = client.usage.retrieve()
    await vi.runAllTimersAsync()
    await result
    expect(calls.map(call => call.started - (calls[0]?.started ?? 0))).toEqual([
      0, 2000, 6000, 14000, 29000
    ])
    vi.mocked(Math.random).mockReturnValue(0.5)
    expect(retryDelay(new APIConnectionError('network'), 1, 'GET')).toBe(2125)
    expect(retryDelay(new APIConnectionError('network'), 10, 'GET')).toBe(15125)
  })
  it('stops after its configured retries', async () => {
    const { client, calls } = mockClient([failure(500), failure(500)])
    const result = expect(client.usage.retrieve({ maxRetries: 1 })).rejects.toBeInstanceOf(
      InternalServerError
    )
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(2)
  })
  it('retries connection failures and exposes their cause when exhausted', async () => {
    const cause = new TypeError('offline')
    const { client, calls } = mockClient([cause, ok(), cause])
    const result = client.usage.retrieve()
    await vi.runAllTimersAsync()
    await result
    await expect(client.usage.retrieve({ maxRetries: 0 })).rejects.toMatchObject({
      name: 'APIConnectionError',
      cause
    })
    expect(calls).toHaveLength(3)
  })
  it.each([
    400, 401, 402, 403, 404, 409, 410, 422, 451, 501
  ])('never retries HTTP %i', async status => {
    const { client, calls } = mockClient([failure(status)])
    await expect(client.usage.retrieve()).rejects.toBeInstanceOf(APIError)
    expect(calls).toHaveLength(1)
  })
  it('allows maxRetries 0 to disable automatic retries', async () => {
    const { client, calls } = mockClient([failure(503)], { maxRetries: 0 })
    await expect(client.usage.retrieve()).rejects.toBeInstanceOf(InternalServerError)
    expect(calls).toHaveLength(1)
  })
  it('does not retry a POST attempt timeout', async () => {
    const { client, calls } = mockClient([() => new Promise(() => {})], { timeout: 25 })
    const result = expect(
      client.enrich.person({ email: 'jane@example.com' })
    ).rejects.toBeInstanceOf(APITimeoutError)
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(1)
    expect(calls[0]?.init.signal?.aborted).toBe(true)
  })
  it('retries a GET timeout', async () => {
    const { client, calls } = mockClient([() => new Promise(() => {}), ok()], { timeout: 25 })
    const result = client.usage.retrieve()
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(2)
  })
  it('times out while reading the response body', async () => {
    const response = new Response(new ReadableStream({ start() {} }))
    const { client } = mockClient([response], { timeout: 20, maxRetries: 0 })
    const result = expect(client.usage.retrieve()).rejects.toBeInstanceOf(APITimeoutError)
    await vi.runAllTimersAsync()
    await result
  })
  it('aborts in-flight requests and retry sleeps without another attempt', async () => {
    for (const response of [failure(503), () => new Promise<Response>(() => {})]) {
      const controller = new AbortController()
      const { client, calls } = mockClient([response])
      const result = expect(
        client.usage.retrieve({ signal: controller.signal })
      ).rejects.toBeInstanceOf(APIConnectionError)
      await vi.advanceTimersByTimeAsync(10)
      controller.abort('cancelled')
      await result
      expect(calls).toHaveLength(1)
    }
  })
  it('does not fetch with a pre-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    const { client, calls } = mockClient([])
    await expect(client.usage.retrieve({ signal: controller.signal })).rejects.toBeInstanceOf(
      APIConnectionError
    )
    expect(calls).toHaveLength(0)
  })
})
