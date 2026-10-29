import { expect, it } from 'vitest'
import ReverseContact from '../src'

it.skipIf(process.env.RC_SDK_LIVE !== '1')(
  'opt-in smoke uses only free API operations',
  async () => {
    const client = new ReverseContact()
    const results = [
      await client.usage.retrieve(),
      await client.search.peopleFields(),
      await client.search.countPeople({ firstName: 'Jane' }),
      await client.search.countOrganizations({ companyName: 'Acme' }),
      await client.fetch.checkPerson({ url: 'https://social.com/in/janedoe' })
    ]
    for (const result of results) expect(result.quotas?.creditsConsumed).toBe(0)
  },
  120_000
)
