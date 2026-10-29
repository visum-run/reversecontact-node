import type { Metadata, Quotas, Result } from '../types'
import { VERSION } from '../version'
import { bounded, positiveTimeout, sleep } from './async'
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  apiError,
  DailyLimitError,
  KeyCreditLimitError,
  NotFoundError,
  RateLimitError,
  ReverseContactError,
  record,
  retryAfter,
  seconds
} from './errors'
import { validateIdempotencyHeaders, validateIdempotencyKey } from './idempotency'
import { randomUUID } from './uuid'

export type Fetch = (...args: Parameters<typeof fetch>) => Promise<Response>
const responseStarts = new WeakMap<Response, number>()
export function requestStartedAt(response: Response): number | undefined {
  return responseStarts.get(response)
}
export interface RequestOptions {
  /** Per-attempt timeout in milliseconds. */
  timeout?: number
  maxRetries?: number
  headers?: RequestInit['headers']
  signal?: AbortSignal
}
export interface IdempotentRequestOptions extends RequestOptions {
  idempotencyKey?: string
}
export interface ClientOptions extends Pick<RequestOptions, 'timeout' | 'maxRetries'> {
  // `| undefined` lets `apiKey: process.env.RC_API_KEY` compile under exactOptionalPropertyTypes.
  apiKey?: string | undefined
  baseUrl?: string
  defaultHeaders?: RequestInit['headers']
  fetch?: Fetch
  appInfo?: { name: string; version?: string; url?: string }
  dangerouslyAllowBrowser?: boolean
  logLevel?: 'debug' | 'off'
}

interface Runtime {
  process?: {
    env?: Record<string, string | undefined>
    versions?: { node?: string; bun?: string }
    platform?: string
  }
  Deno?: {
    env?: { get(name: string): string | undefined }
    version?: { deno?: string }
    build?: { os?: string }
  }
}
function environment(name: string): string | undefined {
  const runtime = globalThis as Runtime
  try {
    return runtime.process?.env?.[name] ?? runtime.Deno?.env?.get(name)
  } catch {
    return undefined
  }
}
function userAgent(app?: ClientOptions['appInfo']): string {
  const runtime = globalThis as Runtime
  const versions = runtime.process?.versions
  const name = versions?.bun
    ? `bun/${versions.bun}`
    : runtime.Deno?.version?.deno
      ? `deno/${runtime.Deno.version.deno}`
      : versions?.node
        ? `node/${versions.node}`
        : 'edge/unknown'
  return `reversecontact-node/${VERSION} (${name}; ${runtime.process?.platform ?? runtime.Deno?.build?.os ?? 'unknown'})${app ? ` ${app.name}${app.version ? `/${app.version}` : ''}` : ''}`
}

export function retryDelay(
  error: unknown,
  retry: number,
  method: string,
  contactSubmit = false
): number | undefined {
  const backoff = (): number => Math.min(1000 * 2 ** retry, 15000) + Math.random() * 250
  if (error instanceof APIConnectionError) {
    if (contactSubmit) return backoff()
    if (error.status !== undefined) return method === 'GET' ? backoff() : undefined
    if (method === 'GET' || method === 'DELETE') return backoff()
    const code = record(record(error.cause).cause).code
    const neverConnected = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'UND_ERR_CONNECT_TIMEOUT'
    ].includes(String(code))
    return method === 'POST' && neverConnected ? backoff() : undefined
  }
  if (
    !(error instanceof APIError) ||
    error instanceof DailyLimitError ||
    error instanceof KeyCreditLimitError
  )
    return undefined
  const delays = [
    retryAfter(error.headers),
    seconds(record(error.details).retryAfter),
    seconds(record(error.details).retryAfterSeconds)
  ]
  if (delays.some(delay => delay !== undefined && delay > 60)) return undefined
  if (contactSubmit && error.status === 409 && error.code === 'IDEMPOTENCY_KEY_IN_USE')
    return delays[0] === undefined ? backoff() : delays[0] * 1000
  if (error instanceof RateLimitError) {
    return error.retryAfter === undefined ? backoff() : error.retryAfter * 1000
  }
  if ([500, 502, 503, 504].includes(error.status)) {
    const delay = delays[0] ?? delays[2] ?? delays[1]
    return delay === undefined ? backoff() : delay * 1000
  }
  return undefined
}

export class Transport {
  readonly timeout: number
  private readonly maxRetries: number
  private readonly baseUrl: string
  private readonly headers: Headers
  private readonly fetcher: Fetch
  private readonly config: ClientOptions
  private readonly debug: boolean

  constructor(options: ClientOptions = {}) {
    if (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      !options.dangerouslyAllowBrowser
    ) {
      throw new ReverseContactError(
        'Keep your API key server-side. Browser use requires dangerouslyAllowBrowser: true.'
      )
    }
    const key = options.apiKey ?? environment('RC_API_KEY')
    if (!key?.trim())
      throw new ReverseContactError('Provide apiKey or set the RC_API_KEY environment variable.')
    this.baseUrl = (
      options.baseUrl ??
      environment('RC_BASE_URL') ??
      'https://api.reversecontact.com'
    ).replace(/\/+$/, '')
    this.timeout = options.timeout ?? 90_000
    this.maxRetries = options.maxRetries ?? 4
    positiveTimeout(this.timeout)
    this.validateRetries(this.maxRetries)
    this.headers = new Headers({
      'Content-Type': 'application/json',
      'User-Agent': userAgent(options.appInfo)
    })
    validateIdempotencyHeaders(options.defaultHeaders)
    new Headers(options.defaultHeaders).forEach((value, name) => {
      this.headers.set(name, value)
    })
    this.headers.set('Authorization', `Bearer ${key}`)
    this.headers.delete('X-Request-Origin')
    const fetcher = options.fetch ?? globalThis.fetch?.bind(globalThis)
    if (!fetcher)
      throw new ReverseContactError('This runtime needs fetch or a custom fetch implementation.')
    this.fetcher = (input, init) => fetcher(input, init)
    const logLevel = options.logLevel ?? (environment('RC_LOG') === 'debug' ? 'debug' : 'off')
    this.debug = logLevel === 'debug'
    this.config = {
      ...options,
      apiKey: key,
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      defaultHeaders: new Headers(options.defaultHeaders),
      appInfo: options.appInfo ? { ...options.appInfo } : undefined,
      fetch: fetcher,
      logLevel
    }
  }

  copyOptions(overrides: ClientOptions): ClientOptions {
    validateIdempotencyHeaders(overrides.defaultHeaders)
    const defaultHeaders = new Headers(this.config.defaultHeaders)
    new Headers(overrides.defaultHeaders).forEach((value, name) => {
      defaultHeaders.set(name, value)
    })
    return { ...this.config, ...overrides, defaultHeaders }
  }

  private log(
    method: string,
    path: string,
    attempt: number,
    status?: number,
    requestId?: string,
    delay = 0
  ): void {
    if (this.debug)
      console.debug('[ReverseContact]', { method, path, status, attempt, delay, requestId })
  }

  private validateRetries(value: number): void {
    if (!Number.isInteger(value) || value < 0)
      throw new ReverseContactError('maxRetries must be a nonnegative integer')
  }

  async request<T>(
    method: string,
    path: string,
    params: unknown,
    options: IdempotentRequestOptions = {},
    deadline?: number
  ): Promise<Result<T>> {
    const retries = options.maxRetries ?? this.maxRetries
    this.validateRetries(retries)
    const url = new URL(`${this.baseUrl}${path}`)
    if (method === 'GET') {
      for (const [key, value] of Object.entries(record(params))) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
      }
    }
    const body = method === 'GET' || params === undefined ? undefined : JSON.stringify(params)
    const contactSubmit =
      method === 'POST' && ['/v2/contact/email', '/v2/contact/phone'].includes(path)
    if (contactSubmit) {
      if (options.idempotencyKey !== undefined) validateIdempotencyKey(options.idempotencyKey)
      validateIdempotencyHeaders(options.headers)
    }
    const headers = new Headers(this.headers)
    new Headers(options.headers).forEach((value, name) => {
      headers.set(name, value)
    })
    headers.delete('X-Request-Origin')
    if (contactSubmit) {
      const key = options.idempotencyKey ?? headers.get('Idempotency-Key') ?? randomUUID()
      validateIdempotencyKey(key)
      headers.set('Idempotency-Key', key)
    }
    for (let attempt = 0; ; attempt++) {
      let response: Response | undefined
      let requestId: string | undefined
      try {
        const remaining = deadline === undefined ? Infinity : deadline - Date.now()
        if (remaining <= 0) throw new APITimeoutError('Request deadline exceeded')
        if (deadline !== undefined && url.searchParams.has('wait'))
          url.searchParams.set(
            'wait',
            String(Math.min(Number(record(params).wait), Math.floor(remaining / 1000)))
          )
        const result = await bounded(
          async signal => {
            const started = Date.now()
            let raw: string
            try {
              response = await this.fetcher(url, { method, headers, body, signal })
            } catch (cause) {
              throw new APIConnectionError('Connection to Reverse Contact failed', { cause })
            }
            responseStarts.set(response, started)
            requestId = response.headers.get('x-request-id') ?? undefined
            const succeeded = response.ok
            try {
              raw = await response.text()
            } catch (cause) {
              if (!succeeded) throw apiError(response, undefined, false)
              throw new APIConnectionError('Could not read the response body', {
                cause,
                status: response.status
              })
            }
            let parsed: unknown = raw
            let isJSON = false
            try {
              parsed = JSON.parse(raw)
              isJSON = true
            } catch {
              /* Handled using the HTTP status below. */
            }
            const metadataId = record(record(parsed).metadata).requestId
            if (typeof metadataId === 'string') requestId = metadataId
            if (!succeeded) throw apiError(response, parsed, isJSON)
            const envelope = record(parsed)
            if (!isJSON || !Object.hasOwn(envelope, 'data'))
              throw new ReverseContactError('The successful response is not a JSON envelope')
            return {
              data: envelope.data as T,
              quotas: envelope.quotas as Quotas | undefined,
              metadata: envelope.metadata as Metadata | undefined,
              response
            }
          },
          Math.min(options.timeout ?? this.timeout, remaining),
          options.signal,
          () =>
            response && !response.ok
              ? apiError(response, undefined, false)
              : new APITimeoutError('Request timed out', { status: response?.status })
        )
        this.log(method, path, attempt + 1, response?.status, requestId)
        return result
      } catch (error) {
        const delay =
          options.signal?.aborted ||
          attempt >= retries ||
          (deadline !== undefined && Date.now() >= deadline)
            ? undefined
            : retryDelay(error, attempt + 1, method, contactSubmit)
        this.log(method, path, attempt + 1, response?.status, requestId, delay)
        if (delay === undefined) throw error
        await sleep(delay, options.signal)
      }
    }
  }

  async lookup<T>(
    path: string,
    params: unknown,
    options?: RequestOptions
  ): Promise<Result<T> | null> {
    try {
      return await this.request<T>('POST', path, params, options)
    } catch (error) {
      if (error instanceof NotFoundError && !['NOT_FOUND', 'HTTP_404'].includes(error.code))
        return null
      throw error
    }
  }
}
