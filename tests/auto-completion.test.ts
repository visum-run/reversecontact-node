import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockClient, ok } from './helpers'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('search autocomplete', () => {
  it('calls the auto-completion-fields path and gives the completions', async () => {
    const data = {
      object: 'search_auto_completions',
      entity: 'person',
      field: 'skills',
      completions: [{ value: 'python', label: 'python' }]
    }
    const { client, calls } = mockClient([ok(data)])

    const result = await client.search.peopleAutoCompletionFields({ field: 'skills', query: 'py' })

    expect(calls[0]?.url.pathname).toBe('/v2/search/people/auto-completion-fields')
    expect(result.data.completions).toEqual([{ value: 'python', label: 'python' }])
  })

  it('keeps the deprecated method on the former path, with its former answer', async () => {
    const data = {
      object: 'search_auto_suggestions',
      entity: 'person',
      field: 'skills',
      suggestions: [{ value: 'python', label: 'python' }]
    }
    const { client, calls } = mockClient([ok(data)])

    const result = await client.search.peopleAutoSuggestion({ field: 'skills', query: 'py' })

    expect(calls[0]?.url.pathname).toBe('/v2/search/people/auto-suggestion')
    expect(result.data.suggestions).toEqual([{ value: 'python', label: 'python' }])
  })
})
