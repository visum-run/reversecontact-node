import sdk = require('@reverse-contact/sdk')

const client = new sdk.ReverseContact({ apiKey: 'test', fetch, defaultHeaders: new Headers() })
void client.withOptions({ timeout: 1000 }).usage.retrieve({ headers: { 'X-Test': 'yes' } })
void client.contact
  .findPhone({ url: 'https://social.com/in/jane' }, { idempotencyKey: 'stable-id' })
  .then(job => {
    const replayed: boolean = job.replayed
    return replayed
  })
