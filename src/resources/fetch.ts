import type { RequestOptions, Transport } from '../core/http'
import { Job } from '../core/job'
import type { Body, Company, Data, JobAcknowledgement, Person, Result } from '../types'

export class Fetch {
  constructor(private readonly transport: Transport) {}
  person(
    params: Body<'fetchPerson'>,
    options?: RequestOptions
  ): Promise<Result<Data<'fetchPerson'>> | null> {
    return this.transport.lookup<Data<'fetchPerson'>>('/v2/fetch/persons', params, options)
  }

  personLive(params: Body<'livePerson'>, options?: RequestOptions): Promise<Job<Person>> {
    return this.transport
      .request<JobAcknowledgement>('POST', '/v2/fetch/persons/live', params, options)
      .then(result => new Job<Person>(this.transport, result))
  }

  checkPerson(
    params: Body<'checkPerson'>,
    options?: RequestOptions
  ): Promise<Result<Data<'checkPerson'>>> {
    return this.transport.request<Data<'checkPerson'>>(
      'POST',
      '/v2/fetch/persons/check',
      params,
      options
    )
  }

  company(
    params: Body<'fetchCompany'>,
    options?: RequestOptions
  ): Promise<Result<Data<'fetchCompany'>> | null> {
    return this.transport.lookup<Data<'fetchCompany'>>('/v2/fetch/companies', params, options)
  }

  companyLive(params: Body<'liveCompany'>, options?: RequestOptions): Promise<Job<Company>> {
    return this.transport
      .request<JobAcknowledgement>('POST', '/v2/fetch/companies/live', params, options)
      .then(result => new Job<Company>(this.transport, result))
  }

  checkCompany(
    params: Body<'checkCompany'>,
    options?: RequestOptions
  ): Promise<Result<Data<'checkCompany'>>> {
    return this.transport.request<Data<'checkCompany'>>(
      'POST',
      '/v2/fetch/companies/check',
      params,
      options
    )
  }
}
