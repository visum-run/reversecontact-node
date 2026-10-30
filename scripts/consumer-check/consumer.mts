import ReverseContact, {
  Area,
  type Fetch,
  Industry,
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
const area: Area = Area.MC_DACH
void (await copy.search.countOrganizations({
  industry: [Industry.SOFTWARE_DEVELOPMENT, 'A value added after this release'],
  location: { area: [area, 'MR:EMEA'] }
}))
const extras: Record<string, unknown> = page.extras
const job = await copy.contact.findEmail(
  { url: 'https://social.com/in/jane' },
  { idempotencyKey: 'stable-id' }
)
const replayed: boolean = job.replayed
void [result, extras, replayed]
