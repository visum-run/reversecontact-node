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
import type { Body, BulkTask, Data, Query, Result, TaskResultLine } from '../types'

/** Bulk enrich people, and follow every background task of the workspace (`/v2/tasks`). */
export class Bulk {
  constructor(private readonly transport: Transport) {}
  async enrichPersons(
    params: Body<'bulkEnrichPersons'>,
    options?: IdempotentRequestOptions
  ): Promise<Result<Data<'bulkEnrichPersons'>>> {
    // One key for every retry: the task reserves credits, a retried POST must not create a second one.
    const headers = new Headers(options?.headers)
    headers.set(
      'Idempotency-Key',
      options?.idempotencyKey ?? headers.get('Idempotency-Key') ?? randomUUID()
    )
    return this.transport.request<Data<'bulkEnrichPersons'>>('POST', '/v2/bulk', params, {
      ...options,
      headers
    })
  }

  list(
    params: Query<'listTasks'> = {},
    options?: RequestOptions
  ): Promise<Page<PageItem<Data<'listTasks'>>, Interpretation<Data<'listTasks'>>>> {
    return page<Data<'listTasks'>>(this.transport, 'GET', '/v2/tasks', params, options)
  }

  retrieve(
    taskId: string,
    params: Query<'getTask'> = {},
    options?: RequestOptions
  ): Promise<Result<Data<'getTask'>>> {
    return this.progress(taskId, params, options)
  }

  private progress(
    taskId: string,
    params: Query<'getTask'>,
    options?: RequestOptions,
    deadline?: number
  ): Promise<Result<BulkTask>> {
    return retrievePoll(
      this.transport,
      `/v2/tasks/${encodeURIComponent(taskId)}`,
      params,
      options,
      deadline
    )
  }

  /**
   * The results file as text, once the task is completed or cancelled (`links.results` is set):
   * the CSV by default, or with `{ format: 'ndjson' }` one `TaskResultLine` JSON object per line.
   */
  results(
    taskId: string,
    params: Query<'getTaskResults'> = {},
    options?: RequestOptions
  ): Promise<string> {
    return this.transport
      .request<string>(
        'GET',
        `/v2/tasks/${encodeURIComponent(taskId)}/results`,
        params,
        options,
        true
      )
      .then(result => result.data)
  }

  /**
   * One page of results, in the order sent, readable from the start of the run. While the task
   * runs, a page stops at the first item not finished: `data` is empty and `nextCursor` is set
   * while the next item runs (read it again after `Retry-After`). `nextCursor` is null once
   * nothing more will come. `extras.status` is the task status when the page was read.
   */
  rows(
    taskId: string,
    params: Query<'getTaskRows'> = {},
    options?: RequestOptions
  ): Promise<Page<PageItem<Data<'getTaskRows'>>, Interpretation<Data<'getTaskRows'>>>> {
    return page<Data<'getTaskRows'>>(
      this.transport,
      'GET',
      `/v2/tasks/${encodeURIComponent(taskId)}/rows`,
      params,
      options
    )
  }

  /**
   * The results one item at a time, as they become ready, whatever the task is doing: it waits
   * while the next item runs (`Retry-After`, 2 seconds by default) and reads the same position
   * again. Ends with the task, or when it is paused, since nothing moves until someone resumes
   * it: read on later with `rows` and the last cursor. A cancelled task still finishes the items
   * it had started, within the hour: it waits for them too.
   */
  async *iterateRows(
    taskId: string,
    params: Query<'getTaskRows'> = {},
    options?: RequestOptions
  ): AsyncGenerator<TaskResultLine, void, unknown> {
    let current = await this.rows(taskId, params, options)
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

  cancel(taskId: string, options?: RequestOptions): Promise<Result<Data<'cancelTask'>>> {
    return this.transport.request<Data<'cancelTask'>>(
      'POST',
      `/v2/tasks/${encodeURIComponent(taskId)}/cancel`,
      undefined,
      options
    )
  }

  /** Resolves once the task no longer moves: completed, cancelled, failed, or paused. */
  wait(taskId: string, options?: WaitOptions<BulkTask>): Promise<Result<BulkTask>> {
    return poll(
      taskId,
      (wait, requestOptions, deadline) => this.progress(taskId, { wait }, requestOptions, deadline),
      snapshot =>
        ['queued', 'running'].includes(snapshot.data.status)
          ? (retryAfter(snapshot.response.headers) ?? 2)
          : null,
      options,
      'response'
    )
  }

  listAll(
    params: Query<'listTasks'> = {},
    options: ListIteratorOptions = {}
  ): AsyncGenerator<PageItem<Data<'listTasks'>>, void, unknown> {
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
