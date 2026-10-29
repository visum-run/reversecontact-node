import { afterEach, expect, it, vi } from 'vitest'
import { ReverseContactError } from '../src'
import { mockClient, ok } from './helpers'

const ack = () => ok({ webhookId: 'job-id', status: 'created', pollUrl: '/v2/webhooks/job-id' })
const params = { url: 'https://social.com/in/jane' }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('generates replay-safe UUIDs with the standard Web Crypto API', async () => {
  const { client, calls } = mockClient([ack(), ack()])
  await client.contact.findEmail(params)
  await client.contact.findPhone(params)
  for (const call of calls)
    expect(new Headers(call.init.headers).get('Idempotency-Key')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
})

it('uses web primitives without Node globals in an edge runtime', async () => {
  vi.stubGlobal('process', undefined)
  const { client, calls } = mockClient([ok(), ack()], { apiKey: 'edge-key' })
  await client.usage.retrieve()
  await client.contact.findEmail(params)
  expect(new Headers(calls[0]?.init.headers).get('user-agent')).toContain('(edge/unknown; unknown)')
  expect(new Headers(calls[1]?.init.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
})

it('reports Deno and reads its environment with no Node globals', async () => {
  vi.stubGlobal('process', undefined)
  vi.stubGlobal('Deno', {
    version: { deno: '2.0' },
    build: { os: 'linux' },
    env: { get: (name: string) => (name === 'RC_API_KEY' ? 'deno-key' : undefined) }
  })
  const { client, calls } = mockClient([ok()], { apiKey: undefined })
  await client.usage.retrieve()
  expect(new Headers(calls[0]?.init.headers).get('user-agent')).toContain('(deno/2.0; linux)')
  expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe('Bearer deno-key')
})

it('can use explicit replay identifiers without Web Crypto or Node', async () => {
  vi.stubGlobal('process', undefined)
  vi.stubGlobal('crypto', undefined)
  const { client, calls } = mockClient([ack(), ack()])
  await client.contact.findEmail(params, { idempotencyKey: 'explicit-key' })
  await client.contact.findPhone(params, { headers: { 'Idempotency-Key': 'explicit-header' } })
  await expect(client.contact.findEmail(params)).rejects.toBeInstanceOf(ReverseContactError)
  expect(calls).toHaveLength(2)
  expect(new Headers(calls[0]?.init.headers).get('Idempotency-Key')).toBe('explicit-key')
  expect(new Headers(calls[1]?.init.headers).get('Idempotency-Key')).toBe('explicit-header')
})

it('exposes only the production resources', () => {
  const { client } = mockClient([])
  expect(client).not.toHaveProperty('lists')
})
