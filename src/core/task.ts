import type { Metadata, Quotas, Result, TaskAcknowledgement, TaskSnapshot } from '../types'
import { retryAfter, TaskFailedError } from './errors'
import type { RequestOptions, Transport } from './http'
import { poll, retrievePoll, type WaitOptions } from './poll'

export function retrieveTask<T>(
  transport: Transport,
  id: string,
  params: { wait?: number } = {},
  options: RequestOptions = {}
): Promise<Result<TaskSnapshot<T>>> {
  return retrievePoll(transport, `/v2/webhooks/${encodeURIComponent(id)}`, params, options)
}

export function waitTask<T>(
  transport: Transport,
  id: string,
  options?: WaitOptions<TaskSnapshot<T>>
): Promise<Result<TaskSnapshot<T>>> {
  return poll(
    id,
    (wait, requestOptions, deadline) =>
      retrievePoll<TaskSnapshot<T>>(
        transport,
        `/v2/webhooks/${encodeURIComponent(id)}`,
        { wait },
        requestOptions,
        deadline
      ),
    snapshot => {
      const data = snapshot.data
      if (data.status === 'succeeded') return null
      if (data.status === 'errored')
        throw new TaskFailedError(id, data.errorCode, data.creditsConsumed, data.result)
      return retryAfter(snapshot.response.headers) ?? 2
    },
    options
  )
}

/** The handle of an async task (live fetch, contact lookup): its acknowledgement, `retrieve` and `wait`. */
export class Task<T> implements Result<TaskAcknowledgement> {
  readonly id: string
  readonly webhookId: string
  readonly status: string
  readonly pollUrl: string
  readonly replayed: boolean
  readonly data: TaskAcknowledgement
  readonly quotas?: Quotas
  readonly metadata?: Metadata
  readonly response: Response

  constructor(
    private readonly transport: Transport,
    result: Result<TaskAcknowledgement>
  ) {
    this.data = result.data
    this.id = result.data.webhookId
    this.webhookId = this.id
    this.status = result.data.status
    this.pollUrl = result.data.pollUrl
    this.replayed = result.response.headers.get('Idempotent-Replayed') === 'true'
    this.quotas = result.quotas
    this.metadata = result.metadata
    this.response = result.response
  }
  retrieve(
    params: { wait?: number } = {},
    options?: RequestOptions
  ): Promise<Result<TaskSnapshot<T>>> {
    return retrieveTask<T>(this.transport, this.id, params, options)
  }
  wait(options?: WaitOptions<TaskSnapshot<T>>): Promise<Result<TaskSnapshot<T>>> {
    return waitTask<T>(this.transport, this.id, options)
  }
}

/** @deprecated Use `Task`: the same class under its former name. */
export const Job = Task
/** @deprecated Use `Task`. */
export type Job<T> = Task<T>
