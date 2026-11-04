import { type ClientOptions, Transport } from './core/http'
import { Bulk } from './resources/bulk'
import { Contact } from './resources/contact'
import { Enrich } from './resources/enrich'
import { Fetch } from './resources/fetch'
import { Jobs } from './resources/jobs'
import { Lists } from './resources/lists'
import { Search } from './resources/search'
import { Usage } from './resources/usage'

export class ReverseContact {
  readonly enrich: Enrich
  readonly fetch: Fetch
  readonly search: Search
  readonly contact: Contact
  readonly jobs: Jobs
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
    this.jobs = new Jobs(transport)
    this.usage = new Usage(transport)
    this.lists = new Lists(transport)
    this.bulk = new Bulk(transport)
  }

  withOptions(options: ClientOptions): ReverseContact {
    return new ReverseContact(this.transport.copyOptions(options))
  }
}
