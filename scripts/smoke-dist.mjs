import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import ReverseContact, { ReverseContact as Named, VERSION } from '@reverse-contact/sdk'

const require = createRequire(import.meta.url)
const cjs = require('@reverse-contact/sdk')
assert.equal(ReverseContact, Named)
assert.equal(cjs.default, cjs.ReverseContact)
assert.equal(VERSION, require('@reverse-contact/sdk/package.json').version)
assert.equal(cjs.VERSION, VERSION)

for (const Client of [ReverseContact, cjs.ReverseContact]) {
  let calls = 0
  const client = new Client({
    apiKey: 'smoke-test',
    fetch: async (input, init) => {
      calls++
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer smoke-test')
      let data = null
      if (calls === 1) {
        assert.equal(String(input), 'https://api.reversecontact.com/v2/usage')
        assert.equal(init.method, 'GET')
      } else if (calls === 2) {
        assert.equal(String(input), 'https://api.reversecontact.com/v2/contact/email')
        assert.equal(init.method, 'POST')
        assert.match(
          new Headers(init.headers).get('Idempotency-Key'),
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        )
        data = { webhookId: 'smoke-email', status: 'created', pollUrl: '/v2/webhooks/smoke-email' }
      } else {
        assert.equal(String(input), 'https://api.reversecontact.com/v2/contact/phone')
        assert.equal(init.method, 'POST')
        assert.equal(new Headers(init.headers).get('Idempotency-Key'), 'smoke-key')
        data = { webhookId: 'smoke-phone', status: 'created', pollUrl: '/v2/webhooks/smoke-phone' }
      }
      return new Response(
        JSON.stringify({
          success: true,
          data,
          error: null,
          metadata: { requestId: 'smoke', executionTimeMs: 0 }
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Idempotent-Replayed': String(calls === 3)
          }
        }
      )
    }
  })
  const result = await client.usage.retrieve()
  assert.equal(result.data, null)
  assert.equal(result.metadata.requestId, 'smoke')
  assert.equal(result.response.status, 200)
  assert.equal(calls, 1)
  const email = await client.contact.findEmail({ url: 'https://social.com/in/jane' })
  assert.equal(email.id, 'smoke-email')
  assert.equal(email.replayed, false)
  const phone = await client.contact.findPhone(
    { url: 'https://social.com/in/jane' },
    { idempotencyKey: 'smoke-key' }
  )
  assert.equal(phone.id, 'smoke-phone')
  assert.equal(phone.replayed, true)
  assert.equal(phone.response.headers.get('Idempotent-Replayed'), 'true')
  assert.equal(calls, 3)
}
console.log('ESM import and CJS require smoke tests passed')
