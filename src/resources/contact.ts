import type { IdempotentRequestOptions, Transport } from '../core/http'
import { Job } from '../core/job'
import type { Body, ContactValue, EmailVerification, JobAcknowledgement } from '../types'

export class Contact {
  constructor(private readonly transport: Transport) {}
  findEmail(
    params: Body<'findContactEmail'>,
    options?: IdempotentRequestOptions
  ): Promise<Job<ContactValue[]>> {
    return this.transport
      .request<JobAcknowledgement>('POST', '/v2/contact/email', params, options)
      .then(result => new Job<ContactValue[]>(this.transport, result))
  }

  verifyEmail(
    params: Body<'verifyContactEmail'>,
    options?: IdempotentRequestOptions
  ): Promise<Job<EmailVerification>> {
    return this.transport
      .request<JobAcknowledgement>('POST', '/v2/contact/email/verify', params, options)
      .then(result => new Job<EmailVerification>(this.transport, result))
  }

  findPhone(
    params: Body<'findContactPhone'>,
    options?: IdempotentRequestOptions
  ): Promise<Job<ContactValue[]>> {
    return this.transport
      .request<JobAcknowledgement>('POST', '/v2/contact/phone', params, options)
      .then(result => new Job<ContactValue[]>(this.transport, result))
  }
}
