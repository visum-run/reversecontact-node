import { ReverseContactError } from './errors'

export function validateIdempotencyKey(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 255 ||
    !/^[\x20-\x7e]+$/.test(value) ||
    value.trim() !== value
  ) {
    throw new ReverseContactError(
      'idempotencyKey must contain 1 to 255 printable ASCII characters with no surrounding whitespace'
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
