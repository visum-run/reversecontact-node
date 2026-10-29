export class ReverseContactError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
  }
}

export function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function seconds(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

export function retryAfter(headers: Headers): number | undefined {
  const value = headers.get('retry-after')
  const numeric = seconds(value)
  if (numeric !== undefined) return numeric
  const date = value ? Date.parse(value) : NaN
  return Number.isFinite(date) ? Math.max(0, (date - Date.now()) / 1000) : undefined
}

export class APIError extends ReverseContactError {
  readonly status: number
  readonly code: string
  readonly details: unknown
  readonly requestId?: string
  readonly headers: Headers
  readonly body: unknown

  constructor(response: Response, body: unknown, isJSON = true) {
    const object = record(body)
    const error = record(object.error)
    const message = isJSON
      ? (error.message ?? object.message ?? `HTTP ${response.status}`)
      : 'The response is not JSON'
    super(String(message))
    this.status = response.status
    this.code =
      typeof error.code === 'string'
        ? error.code
        : typeof object.error === 'string'
          ? object.error
          : `HTTP_${response.status}`
    this.details = error.details
    const requestId = record(object.metadata).requestId
    this.requestId = typeof requestId === 'string' ? requestId : undefined
    this.headers = response.headers
    this.body = body
  }
}
export class BadRequestError extends APIError {}
export class AuthenticationError extends APIError {}
export class InsufficientCreditsError extends APIError {}
export class PermissionDeniedError extends APIError {}
export class NotFoundError extends APIError {}
export class ConflictError extends APIError {}
export class GoneError extends APIError {
  get alternative(): unknown {
    return record(this.body).alternative ?? record(this.details).alternative
  }
}
export class UnprocessableEntityError extends APIError {}
export class RateLimitError extends APIError {
  get retryAfter(): number | undefined {
    return seconds(record(this.details).retryAfter) ?? retryAfter(this.headers)
  }
}
export class DailyLimitError extends RateLimitError {
  get resetAt(): unknown {
    return record(this.details).resetAt
  }
}
export class KeyCreditLimitError extends APIError {
  get period(): unknown {
    return record(this.details).period
  }
  get limit(): unknown {
    return record(this.details).limit
  }
  get used(): unknown {
    return record(this.details).used
  }
  get required(): unknown {
    return record(this.details).required
  }
  get retryAfter(): number | undefined {
    return seconds(record(this.details).retryAfter) ?? retryAfter(this.headers)
  }
  get resetAt(): unknown {
    return record(this.details).resetAt
  }
}
export class UnavailableForLegalReasonsError extends APIError {}
export class InternalServerError extends APIError {}
export class APIConnectionError extends ReverseContactError {
  readonly status?: number

  constructor(message: string, options?: ErrorOptions & { status?: number }) {
    super(message, options)
    this.status = options?.status
  }
}
export class APITimeoutError extends APIConnectionError {}
export class JobFailedError extends ReverseContactError {
  readonly notFound: boolean
  constructor(
    readonly jobId: string,
    readonly errorCode: string | null,
    readonly creditsConsumed: number,
    readonly result: unknown
  ) {
    super(`Job ${jobId} failed: ${errorCode ?? 'unknown error'}`)
    this.notFound = [
      'data-not-found',
      'person-not-found',
      'company-not-found',
      'email-not-found'
    ].includes(errorCode ?? '')
  }
}
export class JobTimeoutError extends ReverseContactError {
  constructor(
    readonly jobId: string,
    readonly lastStatus?: string
  ) {
    super(
      `Waiting for job ${jobId} timed out. The job may still finish; resume waiting with its id.`
    )
  }
}

export function apiError(response: Response, body: unknown, isJSON: boolean): APIError {
  const code = record(record(body).error).code
  let ErrorClass: typeof APIError
  if (code === 'KEY_CREDIT_LIMIT_REACHED') ErrorClass = KeyCreditLimitError
  else if (
    response.status === 429 &&
    (code === 'DAILY_LIMIT_EXCEEDED' || code === 'DAILY_EXTRACTION_LIMIT_EXCEEDED')
  )
    ErrorClass = DailyLimitError
  else
    ErrorClass =
      (
        {
          400: BadRequestError,
          401: AuthenticationError,
          402: InsufficientCreditsError,
          403: PermissionDeniedError,
          404: NotFoundError,
          409: ConflictError,
          410: GoneError,
          422: UnprocessableEntityError,
          429: RateLimitError,
          451: UnavailableForLegalReasonsError
        } as Record<number, typeof APIError>
      )[response.status] ??
      (response.status >= 500 && response.status <= 599 ? InternalServerError : APIError)
  return new ErrorClass(response, body, isJSON)
}
