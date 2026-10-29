import { ReverseContactError, record } from './errors'

export interface WebhookDelivery<T = unknown> {
  webhookId: string
  data: T
  isError: boolean
}

/** Validate the delivery wrapper, preserving the endpoint-specific data unchanged. */
export function parseWebhookDelivery<T = unknown>(payload: unknown): WebhookDelivery<T> {
  const value = record(payload)
  if (
    typeof value.webhookId !== 'string' ||
    !value.webhookId.trim() ||
    typeof value.data !== 'object' ||
    value.data === null
  ) {
    throw new ReverseContactError(
      'Malformed webhook delivery: expected webhookId and object or array data'
    )
  }
  const errorCode = record(value.data).errorCode
  if (
    Object.hasOwn(record(value.data), 'errorCode') &&
    errorCode !== null &&
    typeof errorCode !== 'string'
  )
    throw new ReverseContactError('Malformed webhook delivery: errorCode must be a string')
  return {
    webhookId: value.webhookId,
    data: value.data as T,
    isError: typeof errorCode === 'string' && errorCode.length > 0
  }
}
