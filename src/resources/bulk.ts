import { retryAfter } from '../core/errors'
import type { IdempotentRequestOptions, RequestOptions, Transport } from '../core/http'
import {
  type Interpretation,
  iterate,
  type ListIteratorOptions,
  type Page,
  type PageItem,
  page
} from '../core/page'
import { poll, retrievePoll, type WaitOptions } from '../core/poll'
import { randomUUID } from '../core/uuid'
import type { Body, BulkJob, Data, Query, Result } from '../types'

/** Bulk enrich people, and follow every background job of the workspace (`/v2/jobs`). */
export class Bulk {
  constructor(private readonly transport: Transport) {}
  async enrichPersons(
    params: Body<'bulkEnrichPersons'>,
    options?: IdempotentRequestOptions
  ): Promise<Result<Data<'bulkEnrichPersons'>>> {
    // One key for every retry: the job reserves credits, a retried POST must not create a second one.
    const headers = new Headers(options?.headers)
    headers.set(
      'Idempotency-Key',
      options?.idempotencyKey ?? headers.get('Idempotency-Key') ?? randomUUID()
    )
    return this.transport.request<Data<'bulkEnrichPersons'>>(
      'POST',
      '/v2/enrich/persons/bulk',
      params,
      {
        ...options,
        headers
      }
    )
  }

  list(
    params: Query<'listJobs'> = {},
    options?: RequestOptions
  ): Promise<Page<PageItem<Data<'listJobs'>>, Interpretation<Data<'listJobs'>>>> {
    return page<Data<'listJobs'>>(this.transport, 'GET', '/v2/jobs', params, options)
  }

  retrieve(
    jobId: string,
    params: Query<'getJob'> = {},
    options?: RequestOptions
  ): Promise<Result<Data<'getJob'>>> {
    return this.progress(jobId, params, options)
  }

  private progress(
    jobId: string,
    params: Query<'getJob'>,
    options?: RequestOptions,
    deadline?: number
  ): Promise<Result<BulkJob>> {
    return retrievePoll(
      this.transport,
      `/v2/jobs/${encodeURIComponent(jobId)}`,
      params,
      options,
      deadline
    )
  }

  /** The results CSV as text, once the job is completed or cancelled (`links.results` is set). */
  results(
    jobId: string,
    params: Query<'getJobResults'> = {},
    options?: RequestOptions
  ): Promise<string> {
    return this.transport
      .request<string>(
        'GET',
        `/v2/jobs/${encodeURIComponent(jobId)}/results`,
        params,
        options,
        true
      )
      .then(result => result.data)
  }

  cancel(jobId: string, options?: RequestOptions): Promise<Result<Data<'cancelJob'>>> {
    return this.transport.request<Data<'cancelJob'>>(
      'POST',
      `/v2/jobs/${encodeURIComponent(jobId)}/cancel`,
      undefined,
      options
    )
  }

  /** Resolves once the job no longer moves: completed, cancelled, failed, or paused. */
  wait(jobId: string, options?: WaitOptions<BulkJob>): Promise<Result<BulkJob>> {
    return poll(
      jobId,
      (wait, requestOptions, deadline) => this.progress(jobId, { wait }, requestOptions, deadline),
      snapshot =>
        ['queued', 'running'].includes(snapshot.data.status)
          ? (retryAfter(snapshot.response.headers) ?? 2)
          : null,
      options,
      'response'
    )
  }

  listAll(
    params: Query<'listJobs'> = {},
    options: ListIteratorOptions = {}
  ): AsyncGenerator<PageItem<Data<'listJobs'>>, void, unknown> {
    return iterate(
      request => this.list(request, options),
      params,
      options.maxResults,
      50,
      100,
      false
    )
  }
}
