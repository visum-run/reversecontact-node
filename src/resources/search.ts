import type { RequestOptions, Transport } from '../core/http'
import type { IteratorParams } from '../core/page'
import {
  type Interpretation,
  iterate,
  type Page,
  type PageItem,
  page,
  type SearchIteratorOptions
} from '../core/page'
import type { Body, Data, Result } from '../types'

export class Search {
  constructor(private readonly transport: Transport) {}
  people(
    params: IteratorParams<Body<'searchPeople'>>,
    options?: RequestOptions
  ): Promise<Page<PageItem<Data<'searchPeople'>>, Interpretation<Data<'searchPeople'>>>> {
    return page<Data<'searchPeople'>>(this.transport, 'POST', '/v2/search/people', params, options)
  }

  peopleByPrompt(
    params: IteratorParams<Body<'searchPeopleByPrompt'>>,
    options?: RequestOptions
  ): Promise<
    Page<PageItem<Data<'searchPeopleByPrompt'>>, Interpretation<Data<'searchPeopleByPrompt'>>>
  > {
    return page<Data<'searchPeopleByPrompt'>>(
      this.transport,
      'POST',
      '/v2/search/people/prompt',
      params,
      options
    )
  }

  peopleLookalike(
    params: IteratorParams<Body<'searchPeopleLookalike'>>,
    options?: RequestOptions
  ): Promise<
    Page<PageItem<Data<'searchPeopleLookalike'>>, Interpretation<Data<'searchPeopleLookalike'>>>
  > {
    return page<Data<'searchPeopleLookalike'>>(
      this.transport,
      'POST',
      '/v2/search/people/lookalike',
      params,
      options
    )
  }

  countPeople(
    params: Body<'countPeople'>,
    options?: RequestOptions
  ): Promise<Result<Data<'countPeople'>>> {
    return this.transport.request<Data<'countPeople'>>(
      'POST',
      '/v2/search/people/count',
      params,
      options
    )
  }

  organizations(
    params: IteratorParams<Body<'searchOrganizations'>>,
    options?: RequestOptions
  ): Promise<
    Page<PageItem<Data<'searchOrganizations'>>, Interpretation<Data<'searchOrganizations'>>>
  > {
    return page<Data<'searchOrganizations'>>(
      this.transport,
      'POST',
      '/v2/search/organizations',
      params,
      options
    )
  }

  organizationsByPrompt(
    params: IteratorParams<Body<'searchOrganizationsByPrompt'>>,
    options?: RequestOptions
  ): Promise<
    Page<
      PageItem<Data<'searchOrganizationsByPrompt'>>,
      Interpretation<Data<'searchOrganizationsByPrompt'>>
    >
  > {
    return page<Data<'searchOrganizationsByPrompt'>>(
      this.transport,
      'POST',
      '/v2/search/organizations/prompt',
      params,
      options
    )
  }

  countOrganizations(
    params: Body<'countOrganizations'>,
    options?: RequestOptions
  ): Promise<Result<Data<'countOrganizations'>>> {
    return this.transport.request<Data<'countOrganizations'>>(
      'POST',
      '/v2/search/organizations/count',
      params,
      options
    )
  }

  peopleFields(options?: RequestOptions): Promise<Result<Data<'searchPeopleAvailableFields'>>> {
    return this.transport.request<Data<'searchPeopleAvailableFields'>>(
      'GET',
      '/v2/search/people/available-fields',
      undefined,
      options
    )
  }

  organizationsFields(
    options?: RequestOptions
  ): Promise<Result<Data<'searchOrganizationsAvailableFields'>>> {
    return this.transport.request<Data<'searchOrganizationsAvailableFields'>>(
      'GET',
      '/v2/search/organizations/available-fields',
      undefined,
      options
    )
  }
  iterPeople(
    params: IteratorParams<Body<'searchPeople'>>,
    options: SearchIteratorOptions
  ): AsyncGenerator<PageItem<Data<'searchPeople'>>, void, unknown> {
    return iterate(request => this.people(request, options), params, options?.maxResults, 25, 100)
  }

  iterPeopleByPrompt(
    params: IteratorParams<Body<'searchPeopleByPrompt'>>,
    options: SearchIteratorOptions
  ): AsyncGenerator<PageItem<Data<'searchPeopleByPrompt'>>, void, unknown> {
    return iterate(
      request => this.peopleByPrompt(request, options),
      params,
      options?.maxResults,
      25,
      100
    )
  }

  iterPeopleLookalike(
    params: IteratorParams<Body<'searchPeopleLookalike'>>,
    options: SearchIteratorOptions
  ): AsyncGenerator<PageItem<Data<'searchPeopleLookalike'>>, void, unknown> {
    return iterate(
      request => this.peopleLookalike(request, options),
      params,
      options?.maxResults,
      25,
      100
    )
  }

  iterOrganizations(
    params: IteratorParams<Body<'searchOrganizations'>>,
    options: SearchIteratorOptions
  ): AsyncGenerator<PageItem<Data<'searchOrganizations'>>, void, unknown> {
    return iterate(
      request => this.organizations(request, options),
      params,
      options?.maxResults,
      25,
      100
    )
  }

  iterOrganizationsByPrompt(
    params: IteratorParams<Body<'searchOrganizationsByPrompt'>>,
    options: SearchIteratorOptions
  ): AsyncGenerator<PageItem<Data<'searchOrganizationsByPrompt'>>, void, unknown> {
    return iterate(
      request => this.organizationsByPrompt(request, options),
      params,
      options?.maxResults,
      25,
      100
    )
  }
}
