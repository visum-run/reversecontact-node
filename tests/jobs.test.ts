import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APIConnectionError,
  APITimeoutError,
  GoneError,
  InternalServerError,
  JobFailedError,
  JobTimeoutError,
  NotFoundError,
  parseWebhookDelivery,
  ReverseContactError
} from '../src'
import { failure, job, mockClient, ok } from './helpers'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Job handles and waiting', () => {
  it('returns acknowledgement fields and a typed successful result', async () => {
    const { client, calls } = mockClient([
      ok({ webhookId: 'job-id', status: 'created', pollUrl: '/v2/webhooks/job-id' }),
      job('created'),
      job('succeeded', {
        result: { id: 'prs_jane' },
        deliveryStatus: 'webhook-url-timeout',
        creditsConsumed: 2
      })
    ])
    const handle = await client.fetch.personLive({
      url: 'https://social.com/in/janedoe',
      webhookUrl: 'https://example.com/webhook'
    })
    expect(handle.id).toBe('job-id')
    expect(handle.status).toBe('created')
    expect(handle.data.webhookId).toBe(handle.id)
    expect(handle.response.status).toBe(200)
    expect((await handle.retrieve({ wait: 1 })).data.status).toBe('created')
    const onPoll = vi.fn()
    const result = await handle.wait({ onPoll })
    expect(result.data.result?.id).toBe('prs_jane')
    expect(result.data.deliveryStatus).toBe('webhook-url-timeout')
    expect(result.data.creditsConsumed).toBe(2)
    expect(onPoll).toHaveBeenCalledOnce()
    expect(onPoll).toHaveBeenCalledWith(result)
    expect(calls[2]?.url.searchParams.get('wait')).toBe('20')
    expect(calls.filter(call => call.init.method === 'POST')).toHaveLength(1)
  })
  it('supports contact arrays and resume by id', async () => {
    const { client } = mockClient([
      job('succeeded', { result: [{ value: 'jane@example.com', type: 'professional' }] })
    ])
    const result = await client.jobs.wait<{ value: string; type: string }[]>('stored-id')
    expect(result.data.result?.[0]?.value).toBe('jane@example.com')
  })
  it.each([
    'data-not-found',
    'person-not-found',
    'company-not-found',
    'email-not-found',
    'phone-not-found',
    'fetch-data-error'
  ])('raises JobFailedError for %s without recreating a job', async errorCode => {
    const payload = { partial: true }
    const { client, calls } = mockClient([
      job('errored', { errorCode, result: payload, creditsConsumed: 2 })
    ])
    const result: unknown = await client.jobs.wait('job-id').catch(error => error)
    expect(result).toBeInstanceOf(JobFailedError)
    expect(result).toMatchObject({
      jobId: 'job-id',
      errorCode,
      result: payload,
      creditsConsumed: 2,
      notFound: errorCode !== 'fetch-data-error'
    })
    expect(calls).toHaveLength(1)
  })
  it.each([
    [404, NotFoundError],
    [410, GoneError]
  ])('stops on HTTP %i', async (status, ErrorClass) => {
    const { client, calls } = mockClient([failure(status)])
    await expect(client.jobs.wait('gone')).rejects.toBeInstanceOf(ErrorClass)
    expect(calls).toHaveLength(1)
  })
  it('paces early responses from poll start using Retry-After', async () => {
    const { client, calls } = mockClient([
      job('in_progress', {}, { 'Retry-After': '3' }),
      job('succeeded')
    ])
    const result = client.jobs.wait('job-id')
    await vi.advanceTimersByTimeAsync(2999)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await result
    expect((calls[1]?.started ?? 0) - (calls[0]?.started ?? 0)).toBe(3000)
  })
  it('does not add a pause after a held poll', async () => {
    const { client, calls } = mockClient(
      [() => new Promise(resolve => setTimeout(() => resolve(job()), 20_000)), job('succeeded')],
      { timeout: 10 }
    )
    const result = client.jobs.wait('job-id')
    await vi.advanceTimersByTimeAsync(20_000)
    await result
    expect((calls[1]?.started ?? 0) - (calls[0]?.started ?? 0)).toBe(20_000)
  })
  it('has a minimum poll timeout of pollWait plus 15 seconds', async () => {
    const { client, calls } = mockClient([() => new Promise(() => {})], {
      timeout: 1,
      maxRetries: 0
    })
    const result = expect(client.jobs.retrieve('job-id', { wait: 20 })).rejects.toBeInstanceOf(
      APITimeoutError
    )
    await vi.advanceTimersByTimeAsync(34_999)
    expect(calls[0]?.init.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await result
  })
  it('enforces an overall deadline during a held poll', async () => {
    const { client, calls } = mockClient([() => new Promise(() => {})])
    const result = expect(client.jobs.wait('resume-me', { timeout: 123 })).rejects.toMatchObject({
      name: 'JobTimeoutError',
      jobId: 'resume-me'
    })
    await vi.advanceTimersByTimeAsync(123)
    await result
    expect(calls[0]?.init.signal?.aborted).toBe(true)
  })
  it('reports lastStatus when the deadline expires during pacing', async () => {
    const { client } = mockClient([job()])
    const result = expect(client.jobs.wait('job-id', { timeout: 100 })).rejects.toMatchObject({
      name: 'JobTimeoutError',
      lastStatus: 'in_progress'
    })
    await vi.runAllTimersAsync()
    await result
  })
  it('retries poll failures independently and resets after good answers', async () => {
    const { client, calls } = mockClient(
      [
        failure(503, 'REQUEST_ERROR', undefined, { 'Retry-After': '1' }),
        job(),
        failure(500),
        job('succeeded')
      ],
      { maxRetries: 0 }
    )
    const result = client.jobs.wait('job-id')
    await vi.runAllTimersAsync()
    await result
    expect(calls.map(call => call.started - (calls[0]?.started ?? 0))).toEqual([
      0, 1000, 3000, 5000
    ])
  })
  it('bounds consecutive poll retries', async () => {
    const { client, calls } = mockClient(Array.from({ length: 5 }, () => failure(503)))
    const result = expect(client.jobs.wait('job-id')).rejects.toBeInstanceOf(InternalServerError)
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(5)
  })
  it('honours cancellation during waiting and does not retry', async () => {
    const controller = new AbortController()
    const { client, calls } = mockClient([job()])
    const result = expect(
      client.jobs.wait('job-id', { signal: controller.signal })
    ).rejects.toBeInstanceOf(APIConnectionError)
    await vi.advanceTimersByTimeAsync(10)
    controller.abort()
    await result
    expect(calls).toHaveLength(1)
  })
  it('validates pollWait', async () => {
    const { client, calls } = mockClient([])
    for (const pollWait of [-1, 21, 1.5])
      await expect(client.jobs.wait('id', { pollWait })).rejects.toBeInstanceOf(ReverseContactError)
    expect(calls).toHaveLength(0)
  })
})

describe('remaining polling deadlines', () => {
  it('jobs stops if the deadline expires before a retry can start', async () => {
    const { client, calls } = mockClient([
      async () => {
        vi.setSystemTime(Date.now() + 5000)
        return failure(503)
      }
    ])
    await expect(client.jobs.wait('id', { timeout: 1000 })).rejects.toBeInstanceOf(JobTimeoutError)
    expect(calls).toHaveLength(1)
  })
  it('jobs rejects invalid overall timeouts before fetching', async () => {
    const { client, calls } = mockClient([])
    for (const timeout of [0, -1, Infinity, NaN]) {
      await expect(client.jobs.wait('id', { timeout })).rejects.toMatchObject({
        name: 'ReverseContactError'
      })
    }
    expect(calls).toHaveLength(0)
  })
  it('jobs shrinks wait across polls and retries, then aborts the in-flight poll', async () => {
    const pending = job()
    const { client, calls } = mockClient(
      [
        pending,
        failure(503, 'REQUEST_ERROR', undefined, { 'Retry-After': '1' }),
        () => new Promise(() => {})
      ],
      { timeout: 1 }
    )
    const result = expect(client.jobs.wait('id', { timeout: 5500 })).rejects.toMatchObject({
      name: 'JobTimeoutError',
      jobId: 'id',
      lastStatus: 'in_progress'
    })
    await vi.advanceTimersByTimeAsync(5499)
    expect(calls.map(call => call.url.searchParams.get('wait'))).toEqual(['5', '3', '2'])
    expect(calls[2]?.init.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await result
    expect(calls[2]?.init.signal?.aborted).toBe(true)
    expect(calls).toHaveLength(3)
  })
  it('jobs sends wait=0 for a subsecond deadline', async () => {
    const { client, calls } = mockClient([() => new Promise(() => {})])
    const result = expect(client.jobs.wait('id', { timeout: 50 })).rejects.toBeInstanceOf(
      JobTimeoutError
    )
    await vi.advanceTimersByTimeAsync(50)
    await result
    expect(calls[0]?.url.searchParams.get('wait')).toBe('0')
    expect(calls[0]?.init.signal?.aborted).toBe(true)
  })
  it('jobs keeps the poll timeout floor when the deadline permits', async () => {
    const done = job('succeeded')
    const { client, calls } = mockClient([() => new Promise(() => {}), done], { timeout: 1 })
    const result = client.jobs.wait('id', { timeout: 100_000 })
    await vi.advanceTimersByTimeAsync(34_999)
    expect(calls[0]?.init.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls[0]?.init.signal?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(2000)
    await result
    expect(calls).toHaveLength(2)
  })
})

describe('webhook delivery parser', () => {
  it('accepts profile, contact and error payloads without changing data', () => {
    const data = [{ value: 'jane@example.com', type: 'professional' }]
    expect(parseWebhookDelivery({ webhookId: 'id', data }).data).toBe(data)
    expect(
      parseWebhookDelivery({ webhookId: 'id', data: { id: 'prs_jane', extra: null } }).isError
    ).toBe(false)
    expect(
      parseWebhookDelivery({ webhookId: 'id', data: { errorCode: 'email-not-found' } }).isError
    ).toBe(true)
  })
  it.each([null, '', 'email-not-found'])('isError matches a nonempty string: %j', errorCode => {
    expect(parseWebhookDelivery({ webhookId: 'id', data: { errorCode } }).isError).toBe(
      typeof errorCode === 'string' && errorCode.length > 0
    )
  })
  it.each([
    null,
    {},
    { webhookId: 'id' },
    { webhookId: '', data: {} },
    { webhookId: 'id', data: null },
    { webhookId: 'id', data: 'bad' },
    { webhookId: 'id', data: { errorCode: 123 } },
    { webhookId: 'id', data: { errorCode: undefined } },
    { webhookId: 'id', data: { errorCode: false } },
    { webhookId: 'id', data: { errorCode: [] } },
    { webhookId: 'id', data: { errorCode: {} } }
  ])('rejects malformed payload %j', payload => {
    expect(() => parseWebhookDelivery(payload)).toThrow(ReverseContactError)
  })
})
