import { sleep } from '../core/async'
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
import type { Body, BulkJob, Data, JobResultLine, Query, Result } from '../types'

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

  /**
   * The results file as text, once the job is completed or cancelled (`links.results` is set):
   * the CSV by default, or with `{ format: 'ndjson' }` one `JobResultLine` JSON object per line.
   */
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

  /**
   * One page of results, in the order sent, readable from the start of the run. While the job
   * runs, a page stops at the first item not finished: `data` is empty and `nextCursor` is set
   * while the next item runs (read it again after `Retry-After`). `nextCursor` is null once
   * nothing more will come. `extras.status` is the job status when the page was read.
   */
  rows(
    jobId: string,
    params: Query<'getJobRows'> = {},
    options?: RequestOptions
  ): Promise<Page<PageItem<Data<'getJobRows'>>, Interpretation<Data<'getJobRows'>>>> {
    return page<Data<'getJobRows'>>(
      this.transport,
      'GET',
      `/v2/jobs/${encodeURIComponent(jobId)}/rows`,
      params,
      options
    )
  }

  /**
   * The results one item at a time, as they become ready, whatever the job is doing: it waits
   * while the next item runs (`Retry-After`, 2 seconds by default) and reads the same position
   * again. Ends with the job, or when it is paused, since nothing moves until someone resumes
   * it: read on later with `rows` and the last cursor. A cancelled job still finishes the items
   * it had started, within the hour: it waits for them too.
   */
  async *iterateRows(
    jobId: string,
    params: Query<'getJobRows'> = {},
    options?: RequestOptions
  ): AsyncGenerator<JobResultLine, void, unknown> {
    let current = await this.rows(jobId, params, options)
    while (true) {
      yield* current.data
      if (current.nextCursor === null) return
      if (current.data.length === 0) {
        if (current.extras.status === 'paused') return
        await sleep((retryAfter(current.response.headers) ?? 2) * 1000, options?.signal)
      }
      const next = await current.getNextPage()
      if (next === null) return
      current = next
    }
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
