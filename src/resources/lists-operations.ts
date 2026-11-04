import { ReverseContactError, retryAfter, seconds } from '../core/errors'
import type { RequestOptions, Transport } from '../core/http'
import { poll, retrievePoll, type WaitOptions } from '../core/poll'
import type { Data, ListOperation, Query, Result } from '../types'

export class ListsOperations {
  constructor(private readonly transport: Transport) {}
  retrieve(
    listId: string,
    operationId: string,
    params: Query<'getListOperation'> = {},
    options?: RequestOptions
  ): Promise<Result<Data<'getListOperation'>>> {
    return this.progress(listId, operationId, params, options)
  }

  private progress(
    listId: string,
    operationId: string,
    params: Query<'getListOperation'>,
    options?: RequestOptions,
    deadline?: number
  ): Promise<Result<ListOperation>> {
    return retrievePoll(
      this.transport,
      `/v2/lists/${encodeURIComponent(listId)}/operations/${encodeURIComponent(operationId)}/progress`,
      params,
      options,
      deadline
    )
  }

  cancel(
    listId: string,
    operationId: string,
    options?: RequestOptions
  ): Promise<Result<Data<'cancelListOperation'>>> {
    return this.transport.request<Data<'cancelListOperation'>>(
      'POST',
      `/v2/lists/${encodeURIComponent(listId)}/operations/${encodeURIComponent(operationId)}/cancel`,
      undefined,
      options
    )
  }
  wait(
    listId: string,
    operationId: string,
    options?: WaitOptions<ListOperation>
  ): Promise<Result<ListOperation>> {
    return poll(
      operationId,
      (wait, requestOptions, deadline) =>
        this.progress(listId, operationId, { wait }, requestOptions, deadline),
      snapshot => {
        if (['done', 'resume', 'reconcile'].includes(snapshot.data.clientAction)) return null
        if (snapshot.data.clientAction !== 'poll')
          throw new ReverseContactError('Unknown list operation clientAction')
        return seconds(snapshot.data.pollAfterSeconds) ?? retryAfter(snapshot.response.headers) ?? 2
      },
      options,
      'response'
    )
  }
}
