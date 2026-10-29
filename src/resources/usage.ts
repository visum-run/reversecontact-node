import type { RequestOptions, Transport } from '../core/http'
import type { Data, Result } from '../types'

export class Usage {
  constructor(private readonly transport: Transport) {}
  retrieve(options?: RequestOptions): Promise<Result<Data<'getUsage'>>> {
    return this.transport.request<Data<'getUsage'>>('GET', '/v2/usage', undefined, options)
  }
}
