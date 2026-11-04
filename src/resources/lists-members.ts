import type { RequestOptions, Transport } from '../core/http'
import {
  type Interpretation,
  iterate,
  type ListIteratorOptions,
  type Page,
  type PageItem,
  page
} from '../core/page'
import type { Body, Data, Query, Result } from '../types'

export class ListsMembers {
  constructor(private readonly transport: Transport) {}
  list(
    listId: string,
    params: Query<'listListMembers'> = {},
    options?: RequestOptions
  ): Promise<Page<PageItem<Data<'listListMembers'>>, Interpretation<Data<'listListMembers'>>>> {
    return page<Data<'listListMembers'>>(
      this.transport,
      'GET',
      `/v2/lists/${encodeURIComponent(listId)}/members`,
      params,
      options
    )
  }

  add(
    listId: string,
    params: Body<'addListMembers'>,
    options?: RequestOptions
  ): Promise<Result<Data<'addListMembers'>>> {
    return this.transport.request<Data<'addListMembers'>>(
      'POST',
      `/v2/lists/${encodeURIComponent(listId)}/members`,
      params,
      options
    )
  }

  remove(
    listId: string,
    params: Body<'removeListMembers'>,
    options?: RequestOptions
  ): Promise<Result<Data<'removeListMembers'>>> {
    return this.transport.request<Data<'removeListMembers'>>(
      'DELETE',
      `/v2/lists/${encodeURIComponent(listId)}/members`,
      params,
      options
    )
  }
  listAll(
    listId: string,
    params: Query<'listListMembers'> = {},
    options: ListIteratorOptions = {}
  ): AsyncGenerator<PageItem<Data<'listListMembers'>>, void, unknown> {
    return iterate(
      request => this.list(listId, request, options),
      params,
      options.maxResults,
      100,
      1000,
      false
    )
  }
}
