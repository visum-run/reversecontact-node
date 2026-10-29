import type { RequestOptions, Transport } from '../core/http'
import type { Body, Data, Result } from '../types'

export class Enrich {
  constructor(private readonly transport: Transport) {}
  person(
    params: Body<'enrichPerson'>,
    options?: RequestOptions
  ): Promise<Result<Data<'enrichPerson'>> | null> {
    return this.transport.lookup<Data<'enrichPerson'>>('/v2/enrich/persons', params, options)
  }

  company(
    params: Body<'enrichCompany'>,
    options?: RequestOptions
  ): Promise<Result<Data<'enrichCompany'>> | null> {
    return this.transport.lookup<Data<'enrichCompany'>>('/v2/enrich/companies', params, options)
  }
}
