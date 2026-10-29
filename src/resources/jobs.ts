import type { RequestOptions, Transport } from '../core/http'
import { retrieveJob, waitJob } from '../core/job'
import type { WaitOptions } from '../core/poll'
import type { JobSnapshot, Result } from '../types'

export class Jobs {
  constructor(private readonly transport: Transport) {}
  retrieve<T = unknown>(
    id: string,
    params: { wait?: number } = {},
    options?: RequestOptions
  ): Promise<Result<JobSnapshot<T>>> {
    return retrieveJob<T>(this.transport, id, params, options)
  }
  wait<T = unknown>(
    id: string,
    options?: WaitOptions<JobSnapshot<T>>
  ): Promise<Result<JobSnapshot<T>>> {
    return waitJob<T>(this.transport, id, options)
  }
}
