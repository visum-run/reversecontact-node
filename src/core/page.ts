import type { Metadata, Quotas, Result } from '../types'
import { ReverseContactError, record } from './errors'
import type { RequestOptions, Transport } from './http'

export type PageItem<D> = D extends { data: (infer T)[] } ? T : never
export type Interpretation<D> = D extends { interpretation: infer I } ? I : undefined
export class Page<T, I = undefined> implements Iterable<T> {
  readonly data: T[]
  readonly nextCursor: string | null
  readonly quotas?: Quotas
  readonly metadata?: Metadata
  readonly response: Response
  readonly count?: number
  readonly perPage?: number
  readonly interpretation: I
  readonly extras: Record<string, unknown>

  constructor(
    result: Result<unknown>,
    private readonly next: (cursor: string, options?: RequestOptions) => Promise<Page<T, I>>
  ) {
    const payload = record(result.data)
    const pagination = record(payload.metadata)
    this.data = payload.data as T[]
    if (!Array.isArray(this.data))
      throw new ReverseContactError('The response does not contain a page of items')
    this.nextCursor = typeof pagination.nextCursor === 'string' ? pagination.nextCursor : null
    this.count = typeof pagination.count === 'number' ? pagination.count : undefined
    this.perPage = typeof pagination.perPage === 'number' ? pagination.perPage : undefined
    this.interpretation = payload.interpretation as I
    this.extras = Object.fromEntries(
      Object.entries(payload).filter(([key]) => !['data', 'metadata'].includes(key))
    )
    this.quotas = result.quotas
    this.metadata = result.metadata
    this.response = result.response
  }

  hasNextPage(): boolean {
    return this.nextCursor !== null
  }
  async getNextPage(options?: RequestOptions): Promise<Page<T, I> | null> {
    return this.nextCursor === null ? null : this.next(this.nextCursor, options)
  }
  [Symbol.iterator](): Iterator<T, undefined, unknown> {
    return this.data[Symbol.iterator]()
  }
}

export function page<D>(
  transport: Transport,
  method: string,
  path: string,
  params: unknown,
  options?: RequestOptions
): Promise<Page<PageItem<D>, Interpretation<D>>> {
  const request = snapshot(record(params))
  return transport
    .request<D>(method, path, request, options)
    .then(
      result =>
        new Page<PageItem<D>, Interpretation<D>>(result, (cursor, nextOptions) =>
          page<D>(transport, method, path, { ...request, cursor }, { ...options, ...nextOptions })
        )
    )
}

export interface SearchIteratorOptions extends RequestOptions {
  maxResults: number
}

// Capture the JSON parameters eagerly, before callers can mutate nested filters.
function snapshot<T>(params: T): T {
  return JSON.parse(JSON.stringify(params)) as T
}

export function iterate<T, P extends { perPage?: number; cursor?: string }>(
  load: (params: P & { perPage: number; cursor?: string }) => Promise<Page<T, unknown>>,
  params: P,
  maxResults: number | undefined,
  pageSize: number,
  maximum: number
): AsyncGenerator<T, void, unknown> {
  const perPage = params.perPage ?? pageSize
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > maximum)
    throw new ReverseContactError(`perPage must be an integer from 1 to ${maximum}`)
  return iteratePages(load, snapshot(params), maxResults, perPage)
}

async function* iteratePages<T, P extends { perPage?: number; cursor?: string }>(
  load: (params: P & { perPage: number; cursor?: string }) => Promise<Page<T, unknown>>,
  params: P,
  maxResults: number | undefined,
  perPage: number
): AsyncGenerator<T, void, unknown> {
  if (maxResults === undefined || !Number.isSafeInteger(maxResults) || maxResults < 0) {
    throw new ReverseContactError(
      'maxResults must be a nonnegative safe integer; it is required for search iterators'
    )
  }
  let remaining = maxResults
  let cursor = params.cursor
  const seen = new Set<string>()
  if (cursor) seen.add(cursor)
  while (remaining > 0) {
    const result = await load({ ...params, perPage: Math.min(perPage, remaining), cursor })
    for (const item of result.data) {
      if (remaining <= 0) return
      remaining--
      yield item
    }
    if (result.nextCursor === null) return
    if (seen.has(result.nextCursor))
      throw new ReverseContactError('The API returned a repeated pagination cursor')
    seen.add(result.nextCursor)
    cursor = result.nextCursor
  }
}

export type IteratorParams<T> = Omit<T, 'perPage'> & { perPage?: number }
