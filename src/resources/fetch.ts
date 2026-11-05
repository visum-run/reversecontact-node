import type { RequestOptions, Transport } from '../core/http'
import { Task } from '../core/task'
import type { Body, Company, Data, Person, Result, TaskAcknowledgement } from '../types'

export class Fetch {
  constructor(private readonly transport: Transport) {}
  person(
    params: Body<'fetchPerson'>,
    options?: RequestOptions
  ): Promise<Result<Data<'fetchPerson'>> | null> {
    return this.transport.lookup<Data<'fetchPerson'>>('/v2/fetch/persons', params, options)
  }

  personLive(params: Body<'livePerson'>, options?: RequestOptions): Promise<Task<Person>> {
    return this.transport
      .request<TaskAcknowledgement>('POST', '/v2/fetch/persons/live', params, options)
      .then(result => new Task<Person>(this.transport, result))
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

  companyLive(params: Body<'liveCompany'>, options?: RequestOptions): Promise<Task<Company>> {
    return this.transport
      .request<TaskAcknowledgement>('POST', '/v2/fetch/companies/live', params, options)
      .then(result => new Task<Company>(this.transport, result))
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
