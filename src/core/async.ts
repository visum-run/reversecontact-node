import { APIConnectionError, APITimeoutError, ReverseContactError } from './errors'

export function positiveTimeout(value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > 2_147_483_647) {
    throw new ReverseContactError(
      'timeout must be a positive number of milliseconds at most 2147483647'
    )
  }
}

/** Abort even an injected transport that does not observe AbortSignal. */
export async function bounded<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeout: number,
  signal?: AbortSignal,
  timeoutError: () => ReverseContactError = () =>
    new APITimeoutError(`Request timed out after ${timeout} ms`)
): Promise<T> {
  positiveTimeout(timeout)
  if (signal?.aborted) throw new APIConnectionError('Request aborted', { cause: signal.reason })
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort = (): void => {}
  const stop = new Promise<never>((_, reject) => {
    onAbort = (): void => {
      const error = new APIConnectionError('Request aborted', { cause: signal?.reason })
      reject(error)
      controller.abort(error)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      const error = timeoutError()
      reject(error)
      controller.abort(error)
    }, timeout)
  })
  try {
    return await Promise.race([stop, task(controller.signal)])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new APIConnectionError('Request aborted', { cause: signal.reason })
  if (ms <= 0) return
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new APIConnectionError('Request aborted', { cause: signal?.reason }))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
