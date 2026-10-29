import { type ClientOptions, Transport } from './core/http'
import { Contact } from './resources/contact'
import { Enrich } from './resources/enrich'
import { Fetch } from './resources/fetch'
import { Jobs } from './resources/jobs'
import { Search } from './resources/search'
import { Usage } from './resources/usage'

export class ReverseContact {
  readonly enrich: Enrich
  readonly fetch: Fetch
  readonly search: Search
  readonly contact: Contact
  readonly jobs: Jobs
  readonly usage: Usage
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
  }

  withOptions(options: ClientOptions): ReverseContact {
    return new ReverseContact(this.transport.copyOptions(options))
  }
}
