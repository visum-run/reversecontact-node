import { describe, expect, it } from 'vitest'
import { ReverseContactError } from '../src'
import { collect, metadata, mockClient, quotas, searchPage } from './helpers'

describe('Page', () => {
  it('exposes items, extras, response and a next page with identical filters', async () => {
    const interpretation = { filters: { firstName: 'Jane' }, warnings: [] }
    const { client, calls } = mockClient([
      searchPage(2, 'opaque /?', { interpretation }),
      searchPage(1, null, { interpretation })
    ])
    const first = await client.search.peopleByPrompt(
      { prompt: 'Jane', perPage: 2 },
      { headers: { 'X-Page': 'yes' } }
    )
    expect(first.data).toHaveLength(2)
    expect([...first]).toEqual(first.data)
    expect(first.count).toBe(2)
    expect(first.perPage).toBe(2)
    expect(first.metadata).toEqual(metadata)
    expect(first.quotas).toEqual(quotas)
    expect(first.interpretation).toEqual(interpretation)
    expect(first.extras).toEqual({ interpretation })
    expect(first.response.status).toBe(200)
    expect(first.hasNextPage()).toBe(true)
    const next = await first.getNextPage()
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      prompt: 'Jane',
      perPage: 2,
      cursor: 'opaque /?'
    })
    expect(new Headers(calls[1]?.init.headers).get('X-Page')).toBe('yes')
    expect(next?.hasNextPage()).toBe(false)
    expect(await next?.getNextPage()).toBeNull()
    expect(calls).toHaveLength(2)
  })
  it('snapshots page parameters before the first response, including nested filters', async () => {
    const params = { firstName: 'Jane', futureFilter: { include: ['original'] } }
    const { client, calls } = mockClient([searchPage(1, 'next'), searchPage(0)])
    const pending = client.search.people(params)
    params.firstName = 'John'
    params.futureFilter.include.push('mutated')
    const first = await pending
    await first.getNextPage()
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      firstName: 'Jane',
      futureFilter: { include: ['original'] },
      cursor: 'next'
    })
  })
})

describe('search credit guard', () => {
  const methods = [
    'iterPeople',
    'iterPeopleByPrompt',
    'iterPeopleLookalike',
    'iterOrganizations',
    'iterOrganizationsByPrompt'
  ] as const
  it.each(methods)('%s lowers the last page size and stops at maxResults', async method => {
    const { client, calls } = mockClient([searchPage(3, 'next'), searchPage(2, 'more')])
    const params = { perPage: 3, prompt: 'software leaders', url: 'https://social.com/in/janedoe' }
    const items = await collect<unknown>(client.search[method](params, { maxResults: 5 }))
    expect(items).toHaveLength(5)
    expect(calls.map(call => JSON.parse(String(call.init.body)))).toEqual([
      params,
      { ...params, perPage: 2, cursor: 'next' }
    ])
    expect(calls).toHaveLength(2)
  })
  it('caps even the first page and does no work for zero', async () => {
    const { client, calls } = mockClient([searchPage(1, 'more')])
    expect(await collect(client.search.iterPeople({}, { maxResults: 0 }))).toEqual([])
    expect(
      await collect(client.search.iterPeople({ perPage: 100 }, { maxResults: 1 }))
    ).toHaveLength(1)
    expect(JSON.parse(String(calls[0]?.init.body)).perPage).toBe(1)
  })
  it('requires a valid maximum at runtime as well as in types', async () => {
    const { client, calls } = mockClient([])
    for (const maxResults of [-1, NaN, Infinity, 1.5]) {
      const iterator = client.search.iterPeople({}, { maxResults })
      await expect(iterator.next()).rejects.toBeInstanceOf(ReverseContactError)
    }
    const iterator: unknown = Reflect.apply(client.search.iterPeople, client.search, [{}])
    await expect(collect(iterator as AsyncIterable<unknown>)).rejects.toThrow('required')
    const nullMaximum: unknown = Reflect.apply(client.search.iterPeople, client.search, [
      {},
      { maxResults: null }
    ])
    await expect(collect(nullMaximum as AsyncIterable<unknown>)).rejects.toThrow('required')
    expect(calls).toHaveLength(0)
  })
  it.each(methods)('%s snapshots nested filters at iterator creation', async method => {
    const params = {
      firstName: 'Jane',
      prompt: 'Original prompt',
      url: 'https://social.com/in/jane',
      futureFilter: { include: ['original'] },
      perPage: 1
    }
    const original = JSON.parse(JSON.stringify(params))
    const { client, calls } = mockClient([searchPage(1, 'next'), searchPage(1)])
    const iterator = client.search[method](params, { maxResults: 2 })
    params.firstName = 'John'
    params.futureFilter.include.push('before first next')
    await iterator.next()
    params.prompt = 'Changed prompt'
    params.futureFilter.include.push('between pages')
    await iterator.next()
    expect(calls.map(call => JSON.parse(String(call.init.body)))).toEqual([
      original,
      { ...original, cursor: 'next' }
    ])
  })
  it.each(methods)('%s defaults to 25 results per page', async method => {
    const { client, calls } = mockClient([searchPage(0)])
    await collect<unknown>(
      client.search[method](
        { prompt: 'Founders', url: 'https://social.com/in/jane' },
        { maxResults: 100 }
      )
    )
    expect(JSON.parse(String(calls[0]?.init.body)).perPage).toBe(25)
  })
  it.each(methods)('%s rejects invalid page sizes without sending a request', method => {
    const { client, calls } = mockClient([])
    for (const perPage of [NaN, Infinity, -Infinity, 0, 101, 1.5]) {
      expect(() =>
        client.search[method](
          { perPage, prompt: 'Founders', url: 'https://social.com/in/jane' },
          { maxResults: 5 }
        )
      ).toThrow(new ReverseContactError('perPage must be an integer from 1 to 100'))
      expect(calls).toHaveLength(0)
    }
  })
  it('stops on a null cursor before the maximum', async () => {
    const { client, calls } = mockClient([searchPage(2)])
    expect(await collect(client.search.iterPeople({}, { maxResults: 100 }))).toHaveLength(2)
    expect(calls).toHaveLength(1)
  })
  it('prevents an endless loop on a repeated cursor', async () => {
    const { client } = mockClient([searchPage(0, 'same'), searchPage(0, 'same')])
    await expect(collect(client.search.iterPeople({}, { maxResults: 3 }))).rejects.toThrow(
      'repeated'
    )
  })
  it('does not prefetch when the caller breaks early', async () => {
    const { client, calls } = mockClient([searchPage(2, 'next')])
    for await (const item of client.search.iterPeople({}, { maxResults: 10 })) {
      expect(item.id).toBe('prs_0')
      break
    }
    expect(calls).toHaveLength(1)
  })
})
