import type { RequestOptions, Transport } from '../core/http'
import type { WaitOptions } from '../core/poll'
import { retrieveTask, waitTask } from '../core/task'
import type { Result, TaskSnapshot } from '../types'

/** Async tasks (live fetches, contact lookups) by id: `GET /v2/webhooks/{webhookId}`. */
export class Tasks {
  constructor(private readonly transport: Transport) {}
  retrieve<T = unknown>(
    id: string,
    params: { wait?: number } = {},
    options?: RequestOptions
  ): Promise<Result<TaskSnapshot<T>>> {
    return retrieveTask<T>(this.transport, id, params, options)
  }
  wait<T = unknown>(
    id: string,
    options?: WaitOptions<TaskSnapshot<T>>
  ): Promise<Result<TaskSnapshot<T>>> {
    return waitTask<T>(this.transport, id, options)
  }
}
