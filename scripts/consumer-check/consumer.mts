import ReverseContact, {
  type Fetch,
  type JobSnapshot,
  type Person,
  type Result
} from '@reverse-contact/sdk'

const fetcher: Fetch = fetch
const client = new ReverseContact({
  apiKey: process.env.RC_API_KEY,
  fetch: fetcher,
  defaultHeaders: new Headers()
})
const copy: ReverseContact = client.withOptions({ logLevel: 'off' })
const result: Result<JobSnapshot<Person>> = await copy.jobs.wait<Person>('id', {
  headers: { 'X-Test': 'yes' },
  onPoll: snapshot => {
    const status: string = snapshot.data.status
    void status
  }
})
const page = await copy.search.people({ firstName: 'Jane' })
const extras: Record<string, unknown> = page.extras
const job = await copy.contact.findEmail(
  { url: 'https://social.com/in/jane' },
  { idempotencyKey: 'stable-id' }
)
const replayed: boolean = job.replayed
void [result, extras, replayed]
