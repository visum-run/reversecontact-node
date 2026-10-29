import { ReverseContactError } from './errors'

export function randomUUID(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  throw new ReverseContactError(
    'This runtime needs crypto.randomUUID to generate an idempotency key. Provide one explicitly.'
  )
}
