import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APIConnectionError,
  APITimeoutError,
  BadRequestError,
  ConflictError,
  type IdempotentRequestOptions,
  ReverseContactError,
  UnprocessableEntityError
} from '../src'
import { failure, mockClient, ok } from './helpers'

const params = { url: 'https://social.com/in/jane' }
const ack = (headers?: HeadersInit) =>
  ok({ webhookId: 'job-id', status: 'created', pollUrl: '/v2/webhooks/job-id' }, headers, 202)
const keyOf = (call: { init: RequestInit } | undefined) =>
  new Headers(call?.init.headers).get('Idempotency-Key')
const reset = () => new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })
const unreadable = () =>
  new Response(new ReadableStream({ start: controller => controller.error(reset()) }), {
    status: 202
  })
const stalledBody = () => new Response(new ReadableStream({}), { status: 202 })
const callerOptions: IdempotentRequestOptions[] = [
  { idempotencyKey: 'caller-key' },
  { headers: { 'iDeMpOtEnCy-KeY': 'caller-key' } },
  { headers: [['Idempotency-Key', 'caller-key']] },
  { headers: new Headers({ 'Idempotency-Key': 'caller-key' }) },
  { idempotencyKey: 'caller-key', headers: { 'Idempotency-Key': 'lower-priority' } }
]

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe.each(['findEmail', 'findPhone'] as const)('%s idempotency', method => {
  it('generates a UUID v4 once per call and reuses it on every attempt', async () => {
    const { client, calls } = mockClient([failure(503), ack(), ack()])
    const result = client.contact[method](params)
    await vi.runAllTimersAsync()
    await result
    await client.contact[method](params)
    expect(calls).toHaveLength(3)
    expect(keyOf(calls[0])).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(keyOf(calls[1])).toBe(keyOf(calls[0]))
    expect(keyOf(calls[2])).not.toBe(keyOf(calls[0]))
  })

  it.each(callerOptions)('respects a caller key: %j', async options => {
    const { client, calls } = mockClient([reset(), ack()])
    const result = client.contact[method](params, options)
    await vi.runAllTimersAsync()
    await result
    expect(calls.map(keyOf)).toEqual(['caller-key', 'caller-key'])
  })

  it('respects default headers and request header overrides', async () => {
    const { client, calls } = mockClient([ack(), ack()], {
      defaultHeaders: { 'Idempotency-Key': 'default-key' }
    })
    await client.contact[method](params)
    await client.contact[method](params, { headers: { 'Idempotency-Key': 'request-key' } })
    expect(calls.map(keyOf)).toEqual(['default-key', 'request-key'])
  })

  it.each([
    '',
    ' ',
    ' leading',
    'trailing ',
    '\tkey',
    'key\n',
    'a\x00b',
    '\x7f',
    'é',
    '😀',
    'x'.repeat(256)
  ])('rejects invalid raw caller keys before Headers can normalize them: %j', async key => {
    const { client, calls } = mockClient([])
    const options: IdempotentRequestOptions[] = [
      { idempotencyKey: key },
      { headers: { 'Idempotency-Key': key } },
      { headers: [['Idempotency-Key', key]] }
    ]
    for (const option of options)
      await expect(client.contact[method](params, option)).rejects.toBeInstanceOf(
        ReverseContactError
      )
    expect(calls).toHaveLength(0)
  })

  it.each([null, 123, false])('rejects non-string options from JavaScript: %j', async key => {
    const { client, calls } = mockClient([])
    const options = { idempotencyKey: key } as unknown as IdempotentRequestOptions
    await expect(client.contact[method](params, options)).rejects.toBeInstanceOf(
      ReverseContactError
    )
    expect(calls).toHaveLength(0)
  })

  it.each(['!', 'a b', 'x'.repeat(255)])('accepts valid boundary keys: %j', async key => {
    const { client, calls } = mockClient([ack()])
    await client.contact[method](params, { idempotencyKey: key })
    expect(keyOf(calls[0])).toBe(key)
  })

  it.each([
    ['timeout before headers', () => () => new Promise<Response>(() => {})],
    ['connection reset after send', reset],
    ['unreadable successful body', unreadable],
    ['timeout during successful body', stalledBody]
  ] as const)('retries %s with the same key and body', async (_, response) => {
    const { client, calls } = mockClient([response(), ack()], { timeout: 100, maxRetries: 1 })
    const input = { ...params }
    const options = { idempotencyKey: 'stored-key' }
    const result = client.contact[method](input, options)
    input.url = 'https://social.com/in/another'
    options.idempotencyKey = 'changed-key'
    await vi.runAllTimersAsync()
    await result
    expect(calls.map(keyOf)).toEqual(['stored-key', 'stored-key'])
    expect(calls.map(call => JSON.parse(String(call.init.body)))).toEqual([params, params])
  })

  it('retries an in-progress key after Retry-After', async () => {
    const { client, calls } = mockClient([
      failure(409, 'IDEMPOTENCY_KEY_IN_USE', undefined, { 'Retry-After': '1' }),
      ack({ 'Idempotent-Replayed': 'true' })
    ])
    const result = client.contact[method](params)
    await vi.advanceTimersByTimeAsync(999)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect((await result).replayed).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[1]?.started).toBe((calls[0]?.started ?? 0) + 1000)
    expect(keyOf(calls[1])).toBe(keyOf(calls[0]))
  })

  it.each([0, 2])('bounds 409 retries by maxRetries=%i', async maxRetries => {
    const { client, calls } = mockClient(
      Array.from({ length: maxRetries + 1 }, () =>
        failure(409, 'IDEMPOTENCY_KEY_IN_USE', undefined, { 'Retry-After': '1' })
      ),
      { maxRetries }
    )
    const result = expect(client.contact[method](params)).rejects.toMatchObject({
      name: 'ConflictError',
      code: 'IDEMPOTENCY_KEY_IN_USE'
    })
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(maxRetries + 1)
    expect(new Set(calls.map(keyOf)).size).toBe(1)
  })

  it.each([
    [409, 'ANOTHER_CONFLICT', ConflictError],
    [422, 'IDEMPOTENCY_KEY_REUSED', UnprocessableEntityError],
    [400, 'INVALID_IDEMPOTENCY_KEY', BadRequestError]
  ] as const)('raises %i %s once with its existing class and code', async (status, code, ErrorClass) => {
    const { client, calls } = mockClient([failure(status, code)])
    const error: unknown = await client.contact[method](params).catch(error => error)
    expect(error).toBeInstanceOf(ErrorClass)
    expect(error).toMatchObject({ status, code })
    expect(calls).toHaveLength(1)
  })

  it('preserves the 60-second retry hint limit', async () => {
    const { client, calls } = mockClient([
      failure(409, 'IDEMPOTENCY_KEY_IN_USE', undefined, { 'Retry-After': '61' })
    ])
    await expect(client.contact[method](params)).rejects.toBeInstanceOf(ConflictError)
    expect(calls).toHaveLength(1)
  })

  it.each([
    undefined,
    'false',
    'true',
    'TRUE'
  ])('exposes the acknowledgement replay flag for %j', async header => {
    const { client } = mockClient([
      ack(header === undefined ? {} : { 'Idempotent-Replayed': header })
    ])
    const result = await client.contact[method](params)
    expect(result.replayed).toBe(header === 'true')
    expect(result.response.headers.get('Idempotent-Replayed')).toBe(header ?? null)
  })

  it('does not retry caller cancellation', async () => {
    const controller = new AbortController()
    const { client, calls } = mockClient([() => new Promise(() => {})])
    const result = expect(
      client.contact[method](params, { signal: controller.signal })
    ).rejects.toBeInstanceOf(APIConnectionError)
    controller.abort()
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(1)
  })
})

describe('other POST requests', () => {
  it.each([
    ['timeout before headers', () => () => new Promise<Response>(() => {}), APITimeoutError],
    ['connection reset after send', reset, APIConnectionError],
    ['unreadable successful body', unreadable, APIConnectionError],
    ['timeout during successful body', stalledBody, APITimeoutError]
  ] as const)('does not replay %s, even with an explicit key', async (_, response, ErrorClass) => {
    const { client, calls } = mockClient([response()], { timeout: 100 })
    const result = expect(
      client.fetch.personLive(params, {
        headers: { 'Idempotency-Key': 'not-a-contact-submit' }
      })
    ).rejects.toBeInstanceOf(ErrorClass)
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(1)
  })

  it('does not retry an in-use code outside contact submits', async () => {
    const { client, calls } = mockClient([
      failure(409, 'IDEMPOTENCY_KEY_IN_USE', undefined, { 'Retry-After': '1' })
    ])
    await expect(client.fetch.personLive(params)).rejects.toBeInstanceOf(ConflictError)
    expect(calls).toHaveLength(1)
  })
})

it('validates raw default header keys at construction and on withOptions', () => {
  expect(() => mockClient([], { defaultHeaders: { 'Idempotency-Key': ' bad ' } })).toThrow(
    ReverseContactError
  )
  const { client, calls } = mockClient([])
  expect(() => client.withOptions({ defaultHeaders: { 'Idempotency-Key': ' bad ' } })).toThrow(
    ReverseContactError
  )
  expect(calls).toHaveLength(0)
})
