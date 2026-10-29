import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Job, Page } from '../src'
import { record } from '../src/core/errors'
import { mockClient, ok, searchPage } from './helpers'

const manifestPath = new URL('../../operations.json', import.meta.url)
const specPath = new URL('../../openapi/public-v2.json', import.meta.url)
const hasInputs = existsSync(manifestPath) && existsSync(specPath)
if (!hasInputs)
  console.info('Skipping operation coverage: the monorepo OpenAPI snapshot or manifest is absent.')
const manifest = (hasInputs ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}) as {
  operations: Record<string, { ts: string; kind: string }>
}
const spec = (hasInputs ? JSON.parse(readFileSync(specPath, 'utf8')) : { paths: {} }) as {
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string
        requestBody?: unknown
        parameters?: { in: string; name: string; schema: { type: string; enum?: string[] } }[]
      }
    >
  >
}
const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.entries(methods)
    .filter(([, operation]) => operation.operationId)
    .map(([method, operation]) => ({ path, method, operation }))
)

describe.skipIf(!hasInputs)('OpenAPI and operation manifest coverage', () => {
  it('covers exactly all 21 snapshot operations', () => {
    expect(operations).toHaveLength(21)
    expect(operations.map(({ operation }) => operation.operationId).sort()).toEqual(
      Object.keys(manifest.operations).sort()
    )
  })
  for (const { path, method, operation } of operations) {
    const id = operation.operationId ?? ''
    it(`${id} has a callable method with the correct wire request`, async () => {
      const entry = manifest.operations[id]
      expect(entry).toBeDefined()
      if (!entry) throw new Error('Missing operation map')
      const fixture =
        entry.kind === 'page'
          ? searchPage(1)
          : entry.kind === 'job'
            ? ok({ webhookId: 'job-id', status: 'created', pollUrl: '/v2/webhooks/job-id' })
            : ok({ marker: id })
      const { client, calls } = mockClient([fixture])
      const parts = entry.ts.split('.')
      let owner: unknown = client
      for (const part of parts.slice(0, -1)) owner = record(owner)[part]
      const fn = record(owner)[parts.at(-1) ?? '']
      expect(typeof fn).toBe('function')
      if (typeof fn !== 'function') throw new Error('Missing SDK method')
      const args: unknown[] = []
      let expectedPath = path
      const query: Record<string, string | number> = {}
      for (const parameter of operation.parameters ?? []) {
        if (parameter.in === 'path') {
          const value = `${parameter.name} /?é#`
          args.push(value)
          expectedPath = expectedPath.replace(`{${parameter.name}}`, encodeURIComponent(value))
        } else if (parameter.in === 'query') {
          query[parameter.name] =
            parameter.schema.type === 'integer' ? 7 : (parameter.schema.enum?.[0] ?? 'cursor /?é')
        }
      }
      const body = {
        url: 'https://social.com/in/janedoe',
        sample: { nested: null },
        enabled: false,
        values: []
      }
      if (operation.requestBody) args.push(body)
      else if (Object.keys(query).length) args.push(query)
      args.push({ headers: { 'X-Test': 'all-methods' }, maxRetries: 0, timeout: 1000 })
      const result: unknown = await Reflect.apply(fn, owner, args)
      expect(calls).toHaveLength(1)
      const call = calls[0]
      expect(call?.url.pathname).toBe(expectedPath)
      expect(call?.init.method).toBe(method.toUpperCase())
      expect(Object.fromEntries(call?.url.searchParams ?? [])).toEqual(
        Object.fromEntries(Object.entries(query).map(([name, value]) => [name, String(value)]))
      )
      expect(call?.init.body ? JSON.parse(String(call.init.body)) : undefined).toEqual(
        operation.requestBody ? body : undefined
      )
      expect(new Headers(call?.init.headers).get('X-Test')).toBe('all-methods')
      if (entry.kind === 'job') expect(result).toBeInstanceOf(Job)
      else if (entry.kind === 'page') expect(result).toBeInstanceOf(Page)
      else expect(record(result).data).toEqual({ marker: id })
    })
  }
})
