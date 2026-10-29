import type { Result } from '../types'
import { bounded, positiveTimeout, sleep } from './async'
import { JobTimeoutError, ReverseContactError } from './errors'
import { type RequestOptions, requestStartedAt, type Transport } from './http'

export function retrievePoll<T>(
  transport: Transport,
  path: string,
  params: { wait?: number },
  options: RequestOptions = {},
  deadline?: number
): Promise<Result<T>> {
  return transport.request(
    'GET',
    path,
    params,
    {
      ...options,
      timeout: Math.max(options.timeout ?? transport.timeout, ((params.wait ?? 0) + 15) * 1000)
    },
    deadline
  )
}

export interface WaitOptions<T> extends Omit<RequestOptions, 'timeout' | 'maxRetries'> {
  /** Overall waiting deadline in milliseconds, default 30 minutes. */
  timeout?: number
  pollWait?: number
  onPoll?: (snapshot: Result<T>) => void | Promise<void>
}

export async function poll<T extends { status: string }>(
  id: string,
  retrieve: (wait: number, options: RequestOptions, deadline: number) => Promise<Result<T>>,
  decide: (snapshot: Result<T>) => number | null,
  options: WaitOptions<T> = {}
): Promise<Result<T>> {
  const wait = options.pollWait ?? 20
  if (!Number.isInteger(wait) || wait < 0 || wait > 20)
    throw new ReverseContactError('pollWait must be an integer from 0 to 20')
  let lastStatus: string | undefined
  const deadline = options.timeout ?? 30 * 60 * 1000
  positiveTimeout(deadline)
  const expiresAt = Date.now() + deadline
  return await bounded(
    async signal => {
      while (true) {
        const started = Date.now()
        const remaining = expiresAt - started
        if (remaining <= 0) throw new JobTimeoutError(id, lastStatus)
        const snapshot = await retrieve(
          Math.min(wait, Math.floor(remaining / 1000)),
          { signal, headers: options.headers, maxRetries: 4 },
          expiresAt
        )
        lastStatus = snapshot.data.status
        await options.onPoll?.(snapshot)
        if (Date.now() >= expiresAt) throw new JobTimeoutError(id, lastStatus)
        const delay = decide(snapshot)
        if (delay === null) return snapshot
        const lastAttemptStart = requestStartedAt(snapshot.response) ?? started
        const elapsed = Date.now() - lastAttemptStart
        await sleep(Math.max(0, delay * 1000 - elapsed), signal)
      }
    },
    deadline,
    options.signal,
    () => new JobTimeoutError(id, lastStatus)
  ).catch((error: unknown) => {
    if (Date.now() >= expiresAt && !options.signal?.aborted)
      throw new JobTimeoutError(id, lastStatus)
    throw error
  })
}
