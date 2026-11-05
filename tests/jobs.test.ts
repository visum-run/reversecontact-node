import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APIConnectionError,
  APITimeoutError,
  GoneError,
  InternalServerError,
  Job,
  JobFailedError,
  JobTimeoutError,
  NotFoundError,
  parseWebhookDelivery,
  ReverseContactError,
  Task,
  TaskFailedError,
  TaskTimeoutError
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

describe('Task handles and waiting', () => {
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
    const result = await client.tasks.wait<{ value: string; type: string }[]>('stored-id')
    expect(result.data.result?.[0]?.value).toBe('jane@example.com')
  })
  it.each([
    'data-not-found',
    'person-not-found',
    'company-not-found',
    'email-not-found',
    'phone-not-found',
    'fetch-data-error'
  ])('raises TaskFailedError for %s without recreating a task', async errorCode => {
    const payload = { partial: true }
    const { client, calls } = mockClient([
      job('errored', { errorCode, result: payload, creditsConsumed: 2 })
    ])
    const result: unknown = await client.tasks.wait('job-id').catch(error => error)
    expect(result).toBeInstanceOf(TaskFailedError)
    expect(result).toMatchObject({
      taskId: 'job-id',
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
    await expect(client.tasks.wait('gone')).rejects.toBeInstanceOf(ErrorClass)
    expect(calls).toHaveLength(1)
  })
  it('paces early responses from poll start using Retry-After', async () => {
    const { client, calls } = mockClient([
      job('in_progress', {}, { 'Retry-After': '3' }),
      job('succeeded')
    ])
    const result = client.tasks.wait('job-id')
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
    const result = client.tasks.wait('job-id')
    await vi.advanceTimersByTimeAsync(20_000)
    await result
    expect((calls[1]?.started ?? 0) - (calls[0]?.started ?? 0)).toBe(20_000)
  })
  it('has a minimum poll timeout of pollWait plus 15 seconds', async () => {
    const { client, calls } = mockClient([() => new Promise(() => {})], {
      timeout: 1,
      maxRetries: 0
    })
    const result = expect(client.tasks.retrieve('job-id', { wait: 20 })).rejects.toBeInstanceOf(
      APITimeoutError
    )
    await vi.advanceTimersByTimeAsync(34_999)
    expect(calls[0]?.init.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await result
  })
  it('enforces an overall deadline during a held poll', async () => {
    const { client, calls } = mockClient([() => new Promise(() => {})])
    const result = expect(client.tasks.wait('resume-me', { timeout: 123 })).rejects.toMatchObject({
      name: 'TaskTimeoutError',
      taskId: 'resume-me'
    })
    await vi.advanceTimersByTimeAsync(123)
    await result
    expect(calls[0]?.init.signal?.aborted).toBe(true)
  })
  it('reports lastStatus when the deadline expires during pacing', async () => {
    const { client } = mockClient([job()])
    const result = expect(client.tasks.wait('job-id', { timeout: 100 })).rejects.toMatchObject({
      name: 'TaskTimeoutError',
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
    const result = client.tasks.wait('job-id')
    await vi.runAllTimersAsync()
    await result
    expect(calls.map(call => call.started - (calls[0]?.started ?? 0))).toEqual([
      0, 1000, 3000, 5000
    ])
  })
  it('bounds consecutive poll retries', async () => {
    const { client, calls } = mockClient(Array.from({ length: 5 }, () => failure(503)))
    const result = expect(client.tasks.wait('job-id')).rejects.toBeInstanceOf(InternalServerError)
    await vi.runAllTimersAsync()
    await result
    expect(calls).toHaveLength(5)
  })
  it('honours cancellation during waiting and does not retry', async () => {
    const controller = new AbortController()
    const { client, calls } = mockClient([job()])
    const result = expect(
      client.tasks.wait('job-id', { signal: controller.signal })
    ).rejects.toBeInstanceOf(APIConnectionError)
    await vi.advanceTimersByTimeAsync(10)
    controller.abort()
    await result
    expect(calls).toHaveLength(1)
  })
  it('validates pollWait', async () => {
    const { client, calls } = mockClient([])
    for (const pollWait of [-1, 21, 1.5])
      await expect(client.tasks.wait('id', { pollWait })).rejects.toBeInstanceOf(
        ReverseContactError
      )
    expect(calls).toHaveLength(0)
  })
})

describe('deprecated job names', () => {
  it('keep client.jobs as the same object as client.tasks', async () => {
    const { client, calls } = mockClient([job('succeeded', { result: { id: 'prs_jane' } })])
    expect(client.jobs).toBe(client.tasks)
    const copy = client.withOptions({ maxRetries: 1 })
    expect(copy.jobs).toBe(copy.tasks)
    const result = await client.jobs.wait('stored-id')
    expect(result.data.status).toBe('succeeded')
    expect(calls[0]?.url.pathname).toBe('/v2/webhooks/stored-id')
  })
  it('keep the former class names as the same classes', async () => {
    expect(Job).toBe(Task)
    expect(JobFailedError).toBe(TaskFailedError)
    expect(JobTimeoutError).toBe(TaskTimeoutError)
    const { client } = mockClient([
      ok({ webhookId: 'task-id', status: 'created', pollUrl: '/v2/webhooks/task-id' })
    ])
    const handle = await client.contact.findEmail({ url: 'https://social.com/in/janedoe' })
    expect(handle).toBeInstanceOf(Task)
    expect(handle).toBeInstanceOf(Job)
  })
  it('match instanceof both ways and expose jobId as taskId', () => {
    const timeout = new JobTimeoutError('task-id', 'in_progress')
    expect(timeout).toBeInstanceOf(TaskTimeoutError)
    expect(new TaskTimeoutError('task-id')).toBeInstanceOf(JobTimeoutError)
    expect(timeout.name).toBe('TaskTimeoutError')
    expect(timeout.message).toBe(
      'Waiting for task task-id timed out. The task may still finish; resume waiting with its id.'
    )
    expect(timeout.jobId).toBe(timeout.taskId)
    const failed = new JobFailedError('task-id', 'email-not-found', 1, null)
    expect(failed).toBeInstanceOf(TaskFailedError)
    expect(new TaskFailedError('task-id', null, 0, null)).toBeInstanceOf(JobFailedError)
    expect(failed.jobId).toBe('task-id')
    expect(failed.message).toBe('Task task-id failed: email-not-found')
  })
})

describe('Lists safety and operation waiting', () => {
  it('waits the Lists delay after the progress response', async () => {
    const { client, calls } = mockClient([
      () =>
        new Promise(resolve =>
          setTimeout(
            () => resolve(ok({ status: 'running', clientAction: 'poll', pollAfterSeconds: 3 })),
            500
          )
        ),
      ok({ status: 'completed', clientAction: 'done' })
    ])
    const result = client.lists.operations.wait('list', 'op')
    await vi.runAllTimersAsync()
    await result
    expect((calls[1]?.started ?? 0) - (calls[0]?.started ?? 0)).toBe(3500)
  })
  it('falls back to 2 seconds when the Lists response supplies no delay', async () => {
    const { client, calls } = mockClient([
      ok({ status: 'running', clientAction: 'poll' }),
      ok({ status: 'completed', clientAction: 'done' })
    ])
    const result = client.lists.operations.wait('list', 'op')
    await vi.runAllTimersAsync()
    await result
    expect((calls[1]?.started ?? 0) - (calls[0]?.started ?? 0)).toBe(2000)
  })
  it('reuses its generated idempotency key across retries and creates a fresh one per call', async () => {
    const { client, calls } = mockClient([failure(503), ok({ id: 'one' }), ok({ id: 'two' })])
    const result = client.lists.create({ name: 'Prospects', entity: 'persons' })
    await vi.runAllTimersAsync()
    await result
    await client.lists.create({ name: 'Another', entity: 'persons' })
    const keys = calls.map(call => new Headers(call.init.headers).get('Idempotency-Key'))
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])
  })
  it('uses a caller-provided idempotency key', async () => {
    const { client, calls } = mockClient([ok()])
    await client.lists.create(
      { name: 'Prospects', entity: 'persons' },
      { idempotencyKey: 'caller-key' }
    )
    expect(new Headers(calls[0]?.init.headers).get('Idempotency-Key')).toBe('caller-key')
  })
  it('generates an import operation id once and preserves an explicit id', async () => {
    const { client, calls } = mockClient([failure(503), ok(), ok()])
    const params = { signals: [{ email: 'jane@example.com' }] }
    const result = client.lists.importSignals('list', params)
    await vi.runAllTimersAsync()
    await result
    await client.lists.importSignals('list', { ...params, operationId: 'caller-id' })
    const bodies = calls.map(call => JSON.parse(String(call.init.body)))
    expect(bodies[0].operationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(bodies[1]).toEqual(bodies[0])
    expect(bodies[2].operationId).toBe('caller-id')
    expect(params).not.toHaveProperty('operationId')
  })
  it.each([
    'done',
    'resume',
    'reconcile'
  ])('returns %s without replaying or cancelling the operation', async clientAction => {
    const { client, calls } = mockClient([
      ok({ operationId: 'op', status: 'paused', clientAction })
    ])
    const onPoll = vi.fn()
    const result = await client.lists.operations.wait('list', 'op', { onPoll })
    expect(result.data.clientAction).toBe(clientAction)
    expect(onPoll).toHaveBeenCalledWith(result)
    expect(result.metadata?.requestId).toBe('req_test')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.init.method).toBe('GET')
  })
  it('uses variable pollAfterSeconds before the header', async () => {
    const { client, calls } = mockClient([
      ok({ status: 'running', clientAction: 'poll', pollAfterSeconds: 7 }, { 'Retry-After': '2' }),
      ok({ status: 'completed', clientAction: 'done' })
    ])
    const result = client.lists.operations.wait('list', 'op', { pollWait: 10 })
    await vi.runAllTimersAsync()
    await result
    expect(calls[0]?.url.searchParams.get('wait')).toBe('10')
    expect((calls[1]?.started ?? 0) - (calls[0]?.started ?? 0)).toBe(7000)
  })
  it('falls back to Retry-After for list operation pacing', async () => {
    const { client, calls } = mockClient([
      ok({ status: 'running', clientAction: 'poll' }, { 'Retry-After': '4' }),
      ok({ status: 'completed', clientAction: 'done' })
    ])
    const result = client.lists.operations.wait('list', 'op')
    await vi.runAllTimersAsync()
    await result
    expect((calls[1]?.started ?? 0) - (calls[0]?.started ?? 0)).toBe(4000)
  })
  it('raises a resumable timeout for list operations', async () => {
    const { client } = mockClient([
      ok({ status: 'running', clientAction: 'poll', pollAfterSeconds: 7 })
    ])
    const result = expect(
      client.lists.operations.wait('list', 'op', { timeout: 100 })
    ).rejects.toBeInstanceOf(TaskTimeoutError)
    await vi.runAllTimersAsync()
    await result
  })
})

describe('remaining polling deadlines', () => {
  it.each([
    'tasks',
    'lists'
  ])('%s stops if the deadline expires before a retry can start', async resource => {
    const { client, calls } = mockClient([
      async () => {
        vi.setSystemTime(Date.now() + 5000)
        return failure(503)
      }
    ])
    await expect(
      resource === 'tasks'
        ? client.tasks.wait('id', { timeout: 1000 })
        : client.lists.operations.wait('list', 'id', { timeout: 1000 })
    ).rejects.toBeInstanceOf(TaskTimeoutError)
    expect(calls).toHaveLength(1)
  })
  it.each([
    'tasks',
    'lists'
  ])('%s rejects invalid overall timeouts before fetching', async resource => {
    const { client, calls } = mockClient([])
    for (const timeout of [0, -1, Infinity, NaN]) {
      await expect(
        resource === 'tasks'
          ? client.tasks.wait('id', { timeout })
          : client.lists.operations.wait('list', 'id', { timeout })
      ).rejects.toMatchObject({ name: 'ReverseContactError' })
    }
    expect(calls).toHaveLength(0)
  })
  it.each([
    'tasks',
    'lists'
  ])('%s shrinks wait across polls and retries, then aborts the in-flight poll', async resource => {
    const pending = resource === 'tasks' ? job() : ok({ status: 'running', clientAction: 'poll' })
    const { client, calls } = mockClient(
      [
        pending,
        failure(503, 'REQUEST_ERROR', undefined, { 'Retry-After': '1' }),
        () => new Promise(() => {})
      ],
      { timeout: 1 }
    )
    const result = expect(
      resource === 'tasks'
        ? client.tasks.wait('id', { timeout: 5500 })
        : client.lists.operations.wait('list', 'id', { timeout: 5500 })
    ).rejects.toMatchObject({
      name: 'TaskTimeoutError',
      taskId: 'id',
      lastStatus: resource === 'tasks' ? 'in_progress' : 'running'
    })
    await vi.advanceTimersByTimeAsync(5499)
    expect(calls.map(call => call.url.searchParams.get('wait'))).toEqual(['5', '3', '2'])
    expect(calls[2]?.init.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await result
    expect(calls[2]?.init.signal?.aborted).toBe(true)
    expect(calls).toHaveLength(3)
  })
  it.each(['tasks', 'lists'])('%s sends wait=0 for a subsecond deadline', async resource => {
    const { client, calls } = mockClient([() => new Promise(() => {})])
    const result = expect(
      resource === 'tasks'
        ? client.tasks.wait('id', { timeout: 50 })
        : client.lists.operations.wait('list', 'id', { timeout: 50 })
    ).rejects.toBeInstanceOf(TaskTimeoutError)
    await vi.advanceTimersByTimeAsync(50)
    await result
    expect(calls[0]?.url.searchParams.get('wait')).toBe('0')
    expect(calls[0]?.init.signal?.aborted).toBe(true)
  })
  it.each([
    'tasks',
    'lists'
  ])('%s keeps the poll timeout floor when the deadline permits', async resource => {
    const done =
      resource === 'tasks' ? job('succeeded') : ok({ status: 'completed', clientAction: 'done' })
    const { client, calls } = mockClient([() => new Promise(() => {}), done], { timeout: 1 })
    const result =
      resource === 'tasks'
        ? client.tasks.wait('id', { timeout: 100_000 })
        : client.lists.operations.wait('list', 'id', { timeout: 100_000 })
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
