import type { IdempotentRequestOptions, RequestOptions, Transport } from '../core/http'
import {
  type Interpretation,
  iterate,
  type ListIteratorOptions,
  type Page,
  type PageItem,
  page
} from '../core/page'
import { randomUUID } from '../core/uuid'
import type { Body, Data, Query, Result } from '../types'
import { ListsMembers } from './lists-members'
import { ListsOperations } from './lists-operations'

export class Lists {
  constructor(private readonly transport: Transport) {
    this.members = new ListsMembers(transport)
    this.operations = new ListsOperations(transport)
  }
  list(
    params: Query<'listLists'> = {},
    options?: RequestOptions
  ): Promise<Page<PageItem<Data<'listLists'>>, Interpretation<Data<'listLists'>>>> {
    return page<Data<'listLists'>>(this.transport, 'GET', '/v2/lists', params, options)
  }

  async create(
    params: Body<'createList'>,
    options?: IdempotentRequestOptions
  ): Promise<Result<Data<'createList'>>> {
    const headers = new Headers(options?.headers)
    headers.set(
      'Idempotency-Key',
      options?.idempotencyKey ?? headers.get('Idempotency-Key') ?? randomUUID()
    )
    return this.transport.request<Data<'createList'>>('POST', '/v2/lists', params, {
      ...options,
      headers
    })
  }

  retrieve(
    listId: string,
    params: Query<'getList'> = {},
    options?: RequestOptions
  ): Promise<Result<Data<'getList'>>> {
    return this.transport.request<Data<'getList'>>(
      'GET',
      `/v2/lists/${encodeURIComponent(listId)}`,
      params,
      options
    )
  }

  delete(listId: string, options?: RequestOptions): Promise<Result<Data<'deleteList'>>> {
    return this.transport.request<Data<'deleteList'>>(
      'DELETE',
      `/v2/lists/${encodeURIComponent(listId)}`,
      undefined,
      options
    )
  }

  async importSignals(
    listId: string,
    params: Body<'importListSignals'>,
    options?: RequestOptions
  ): Promise<Result<Data<'importListSignals'>>> {
    return this.transport.request<Data<'importListSignals'>>(
      'POST',
      `/v2/lists/${encodeURIComponent(listId)}/intake/signals`,
      { ...params, operationId: params.operationId ?? randomUUID() },
      options
    )
  }

  export(listId: string, options?: RequestOptions): Promise<string> {
    return this.transport
      .request<string>(
        'GET',
        `/v2/lists/${encodeURIComponent(listId)}/export`,
        undefined,
        options,
        true
      )
      .then(result => result.data)
  }
  readonly members: ListsMembers
  readonly operations: ListsOperations
  listAll(
    params: Query<'listLists'> = {},
    options: ListIteratorOptions = {}
  ): AsyncGenerator<PageItem<Data<'listLists'>>, void, unknown> {
    return iterate(
      request => this.list(request, options),
      params,
      options.maxResults,
      200,
      200,
      false
    )
  }
}
