import type { IdempotentRequestOptions, Transport } from '../core/http'
import { Task } from '../core/task'
import type { Body, ContactValue, EmailVerification, TaskAcknowledgement } from '../types'

export class Contact {
  constructor(private readonly transport: Transport) {}
  findEmail(
    params: Body<'findContactEmail'>,
    options?: IdempotentRequestOptions
  ): Promise<Task<ContactValue[]>> {
    return this.transport
      .request<TaskAcknowledgement>('POST', '/v2/contact/email', params, options)
      .then(result => new Task<ContactValue[]>(this.transport, result))
  }

  verifyEmail(
    params: Body<'verifyContactEmail'>,
    options?: IdempotentRequestOptions
  ): Promise<Task<EmailVerification>> {
    return this.transport
      .request<TaskAcknowledgement>('POST', '/v2/contact/email/verify', params, options)
      .then(result => new Task<EmailVerification>(this.transport, result))
  }

  findPhone(
    params: Body<'findContactPhone'>,
    options?: IdempotentRequestOptions
  ): Promise<Task<ContactValue[]>> {
    return this.transport
      .request<TaskAcknowledgement>('POST', '/v2/contact/phone', params, options)
      .then(result => new Task<ContactValue[]>(this.transport, result))
  }
}
