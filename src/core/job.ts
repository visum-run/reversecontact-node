import type { JobAcknowledgement, JobSnapshot, Metadata, Quotas, Result } from '../types'
import { JobFailedError, retryAfter } from './errors'
import type { RequestOptions, Transport } from './http'
import { poll, retrievePoll, type WaitOptions } from './poll'

export function retrieveJob<T>(
  transport: Transport,
  id: string,
  params: { wait?: number } = {},
  options: RequestOptions = {}
): Promise<Result<JobSnapshot<T>>> {
  return retrievePoll(transport, `/v2/webhooks/${encodeURIComponent(id)}`, params, options)
}

export function waitJob<T>(
  transport: Transport,
  id: string,
  options?: WaitOptions<JobSnapshot<T>>
): Promise<Result<JobSnapshot<T>>> {
  return poll(
    id,
    (wait, requestOptions, deadline) =>
      retrievePoll<JobSnapshot<T>>(
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
        throw new JobFailedError(id, data.errorCode, data.creditsConsumed, data.result)
      return retryAfter(snapshot.response.headers) ?? 2
    },
    options
  )
}

export class Job<T> implements Result<JobAcknowledgement> {
  readonly id: string
  readonly webhookId: string
  readonly status: string
  readonly pollUrl: string
  readonly replayed: boolean
  readonly data: JobAcknowledgement
  readonly quotas?: Quotas
  readonly metadata?: Metadata
  readonly response: Response

  constructor(
    private readonly transport: Transport,
    result: Result<JobAcknowledgement>
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
  ): Promise<Result<JobSnapshot<T>>> {
    return retrieveJob<T>(this.transport, this.id, params, options)
  }
  wait(options?: WaitOptions<JobSnapshot<T>>): Promise<Result<JobSnapshot<T>>> {
    return waitJob<T>(this.transport, this.id, options)
  }
}
