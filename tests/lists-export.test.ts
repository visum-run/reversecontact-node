import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ListExportLine } from '../src'
import { mockClient } from './helpers'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('lists.export', () => {
  it('gives the CSV as text by default', async () => {
    const body = 'linkedin_url,name\r\nhttps://www.linkedin.com/in/ada,Ada'
    const { client, calls } = mockClient([
      new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } })
    ])
    expect(await client.lists.export('l')).toBe(body)
    expect(calls[0]?.url.pathname).toBe('/v2/lists/l/export')
    expect(calls[0]?.url.searchParams.get('format')).toBeNull()
  })

  it('still takes the request options second, as before 0.5', async () => {
    const { client, calls } = mockClient([
      new Response('name\r\nAda', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } })
    ])
    await client.lists.export('l', { headers: { 'X-Trace': 'abc' } })
    expect(calls[0]?.url.search).toBe('')
    expect(new Headers(calls[0]?.init.headers).get('X-Trace')).toBe('abc')
  })

  it('passes the CSV columns', async () => {
    const { client, calls } = mockClient([
      new Response('name\r\nAda', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } })
    ])
    await client.lists.export('l', { fields: 'name,linkedin_url' })
    expect(calls[0]?.url.searchParams.get('fields')).toBe('name,linkedin_url')
  })

  it('gives one ListExportLine per line when asked for NDJSON', async () => {
    const member: ListExportLine = {
      kind: 'member',
      id: 'm1',
      entityId: 'prs_ada',
      externalId: null,
      person: null,
      company: null,
      isFullProfile: false,
      customColumns: []
    }
    const pending: ListExportLine = {
      kind: 'pending',
      id: 'p1',
      signal: { email: 'missing@example.com' },
      customColumns: [{ id: 'c1', name: 'Owner', value: null }]
    }
    const body = `${JSON.stringify(member)}\n${JSON.stringify(pending)}\n`
    const { client, calls } = mockClient([
      new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } })
    ])
    const text = await client.lists.export('l', { format: 'ndjson' })
    expect(text).toBe(body)
    const lines = text
      .trim()
      .split('\n')
      .map(value => JSON.parse(value) as ListExportLine)
    expect(lines.map(line => line.kind)).toEqual(['member', 'pending'])
    expect(calls[0]?.url.searchParams.get('format')).toBe('ndjson')
  })
})
