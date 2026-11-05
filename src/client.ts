import { type ClientOptions, Transport } from './core/http'
import { Bulk } from './resources/bulk'
import { Contact } from './resources/contact'
import { Enrich } from './resources/enrich'
import { Fetch } from './resources/fetch'
import { Lists } from './resources/lists'
import { Search } from './resources/search'
import { Tasks } from './resources/tasks'
import { Usage } from './resources/usage'

export class ReverseContact {
  readonly enrich: Enrich
  readonly fetch: Fetch
  readonly search: Search
  readonly contact: Contact
  /** Async tasks (live fetches, contact lookups) by id: `retrieve` and `wait`. */
  readonly tasks: Tasks
  /** @deprecated Use `tasks`: the same object under its former name. */
  readonly jobs: Tasks
  readonly usage: Usage
  readonly lists: Lists
  readonly bulk: Bulk
  private readonly transport: Transport

  constructor(options: ClientOptions = {}) {
    const transport = new Transport(options)
    this.transport = transport
    this.enrich = new Enrich(transport)
    this.fetch = new Fetch(transport)
    this.search = new Search(transport)
    this.contact = new Contact(transport)
    this.tasks = new Tasks(transport)
    this.jobs = this.tasks
    this.usage = new Usage(transport)
    this.lists = new Lists(transport)
    this.bulk = new Bulk(transport)
  }

  withOptions(options: ClientOptions): ReverseContact {
    return new ReverseContact(this.transport.copyOptions(options))
  }
}
