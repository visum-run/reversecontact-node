import sdk = require('@reverse-contact/sdk')

const client = new sdk.ReverseContact({ apiKey: 'test', fetch, defaultHeaders: new Headers() })
void client.withOptions({ timeout: 1000 }).usage.retrieve({ headers: { 'X-Test': 'yes' } })
void client.search.countPeople({ currentSeniority: [sdk.Seniority.OWNER_FOUNDER, 'Board'] })
void client.contact
  .findPhone({ url: 'https://social.com/in/jane' }, { idempotencyKey: 'stable-id' })
  .then(task => {
    const replayed: boolean = task.replayed
    return replayed
  })
