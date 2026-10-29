import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import * as sdk from '../src'
import { record } from '../src/core/errors'
import { failure, job, ok, searchPage } from './helpers'

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const examples = new URL('../examples/', import.meta.url)
const snippets = [
  ...[...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((match, index) => ({
    name: `README ${index + 1}`,
    code: match[1] ?? ''
  })),
  ...readdirSync(examples)
    .filter(name => name.endsWith('.ts'))
    .map(name => ({ name, code: readFileSync(new URL(name, examples), 'utf8') })),
  {
    name: 'live smoke requests',
    code:
      readFileSync(new URL('./live.test.ts', import.meta.url), 'utf8').match(
        /const results = \[[\s\S]*?\n {4}\]/
      )?.[0] ?? ''
  }
]
const specPath = new URL('../../openapi/public-v2.json', import.meta.url)
const hasSnapshot = existsSync(specPath)
if (!hasSnapshot)
  console.info('Skipping documented request validity: the monorepo OpenAPI snapshot is absent.')
const spec = (hasSnapshot ? JSON.parse(readFileSync(specPath, 'utf8')) : { paths: {} }) as {
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string
        requestBody?: { content: Record<string, { schema: Record<string, unknown> }> }
        parameters?: { name: string; in: string; schema: Record<string, unknown> }[]
      }
    >
  >
  components: { schemas: Record<string, Record<string, unknown>> }
}
const routes = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.entries(methods)
    .filter(([, operation]) => operation.operationId)
    .map(([method, operation]) => ({
      pattern: new RegExp(`^${path.replace(/\{[^}]+\}/g, '[^/]+')}$`),
      method: method.toUpperCase(),
      operation
    }))
)

function schemaFields(schema: Record<string, unknown>): Record<string, unknown> {
  const ref = schema.$ref
  if (typeof ref === 'string')
    return schemaFields(spec.components.schemas[ref.split('/').at(-1) ?? ''] ?? {})
  return record(schema.properties)
}

describe.skipIf(!hasSnapshot)('documented request validity', () => {
  it.each(snippets)('$name uses snapshot routes, supported fields and real search filters', async ({
    code
  }) => {
    expect(code).not.toBe('')
    const fetcher = vi.fn<sdk.Fetch>(async (input, init) => {
      const url = new URL(String(input))
      const route = routes.find(
        route => route.method === init?.method && route.pattern.test(url.pathname)
      )
      expect(route, `${init?.method} ${url.pathname}`).toBeDefined()
      if (!route) throw new Error('Undocumented route')
      const { operation } = route
      const body = record(init?.body ? JSON.parse(String(init.body)) : undefined)
      const properties = schemaFields(
        operation.requestBody?.content['application/json']?.schema ?? {}
      )
      for (const key of Object.keys(body))
        expect(properties, `${operation.operationId}.${key}`).toHaveProperty(key)
      if (url.pathname.startsWith('/v2/search/') && init?.method === 'POST') {
        const filters = Object.keys(body).filter(key => key !== 'perPage' && key !== 'cursor')
        expect(filters.length, `${operation.operationId} needs a filter`).toBeGreaterThan(0)
      }
      for (const [name, value] of url.searchParams) {
        const parameter = operation.parameters?.find(
          parameter => parameter.in === 'query' && parameter.name === name
        )
        expect(parameter, `${operation.operationId} query ${name}`).toBeDefined()
        if (parameter?.schema.enum) expect(parameter.schema.enum).toContain(value)
        if (parameter?.schema.type === 'integer') {
          expect(Number.isInteger(Number(value))).toBe(true)
          if (typeof parameter.schema.minimum === 'number')
            expect(Number(value)).toBeGreaterThanOrEqual(parameter.schema.minimum)
          if (typeof parameter.schema.maximum === 'number')
            expect(Number(value)).toBeLessThanOrEqual(parameter.schema.maximum)
        }
      }
      const id = operation.operationId ?? ''
      if (id === 'fetchPerson') return failure(404, 'PERSON_NOT_FOUND')
      if (id === 'enrichPerson') return ok({ person: { id: 'person' }, isFullProfile: true })
      if (id === 'pollWebhook') return job('succeeded', { result: [] })
      if (id.startsWith('live') || id.startsWith('findContact'))
        return ok({ webhookId: 'job', status: 'created', pollUrl: '/v2/webhooks/job' })
      if (id.startsWith('search') && !id.endsWith('AvailableFields')) return searchPage(0)
      return ok({ count: 0 })
    })
    class ExampleClient extends sdk.ReverseContact {
      constructor(options: sdk.ClientOptions = {}) {
        super({ ...options, apiKey: 'example-key', fetch: fetcher, maxRetries: 0, logLevel: 'off' })
      }
    }
    const javascript = ts.transpileModule(code.replace(/^import .*$/gm, ''), {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext }
    }).outputText
    await (runInNewContext(`(async () => { ${javascript} })()`, {
      ...sdk,
      ReverseContact: ExampleClient,
      client: new ExampleClient(),
      console: { log() {}, error() {} },
      process: { env: { RC_API_KEY: 'example-key' } },
      fetch: fetcher,
      AbortController,
      receivedBody: { webhookId: 'job', data: {} }
    }) as Promise<void>)
  })
})
