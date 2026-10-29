import { ReverseContactError } from './errors'

export function validateIdempotencyKey(value: unknown): asserts value is string {
  // Same rule as the API: 1 to 255 printable ASCII characters, spaces excluded.
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(value)) {
    throw new ReverseContactError(
      'idempotencyKey must contain 1 to 255 printable ASCII characters, without spaces'
    )
  }
}

// Validate raw values before Headers trims whitespace or rejects non-ASCII input.
export function validateIdempotencyHeaders(input?: RequestInit['headers']): void {
  const entries =
    input instanceof Headers
      ? input.entries()
      : Array.isArray(input)
        ? input
        : Object.entries(input ?? {})
  for (const [name, value] of entries) {
    if (name.toLowerCase() === 'idempotency-key') validateIdempotencyKey(value)
  }
}
