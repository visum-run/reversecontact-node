import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  Area,
  type CatalogValue,
  ContractType,
  CountryCode,
  EmailType,
  type FindEmailParams,
  Industry,
  JobFunction,
  JobSubFunction,
  type SearchOrganizationsParams,
  type SearchPeopleParams,
  Seniority
} from '../src'
import { mockClient, ok } from './helpers'

const catalogs = {
  Industry,
  CountryCode,
  JobFunction,
  JobSubFunction,
  Seniority,
  ContractType,
  Area,
  EmailType
}
const specPath = new URL('../../openapi/public-v2.json', import.meta.url)
const hasSnapshot = existsSync(specPath)
const schemas = (
  hasSnapshot ? JSON.parse(readFileSync(specPath, 'utf8')).components.schemas : {}
) as Record<string, { type?: string; enum?: string[] }>

describe.skipIf(!hasSnapshot)('published lists', () => {
  it('turns every named list of the spec into constants, value for value', () => {
    const named = Object.keys(schemas).filter(
      name => schemas[name]?.type === 'string' && schemas[name]?.enum
    )
    expect(named.sort()).toEqual(Object.keys(catalogs).sort())
    for (const [name, constants] of Object.entries(catalogs)) {
      expect(Object.values(constants)).toEqual(schemas[name]?.enum)
    }
  })
})

describe('list constants', () => {
  it('name each value in upper snake case', () => {
    expect(Industry.SOFTWARE_DEVELOPMENT).toBe('Software Development')
    expect(Seniority.OWNER_FOUNDER).toBe('Owner / Founder')
    expect(ContractType.FULL_TIME).toBe('full-time')
    expect(Area.MC_DACH).toBe('MC:DACH')
    expect(CountryCode.FR).toBe('FR')
    expect(EmailType.PERSONAL).toBe('personal')
    for (const constants of Object.values(catalogs)) {
      for (const key of Object.keys(constants)) expect(key).toMatch(/^[A-Z_][A-Z0-9_]*$/)
    }
  })

  it('send the plain value', async () => {
    const { client, calls } = mockClient([ok({ count: 1 })])
    await client.search.countOrganizations({
      industry: [Industry.SOFTWARE_DEVELOPMENT],
      location: { area: Area.MR_EMEA, countryCode: [CountryCode.FR] }
    })
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      industry: ['Software Development'],
      location: { area: 'MR:EMEA', countryCode: ['FR'] }
    })
  })

  it('leave the list-bound parameters open to any string, the rest unchanged', () => {
    expectTypeOf<'Software Development'>().toExtend<CatalogValue>()
    expectTypeOf<string>().toExtend<NonNullable<SearchOrganizationsParams['industry']>>()
    expectTypeOf<Industry>().toExtend<NonNullable<SearchOrganizationsParams['industry']>>()
    expectTypeOf<string[]>().toExtend<NonNullable<SearchPeopleParams['currentSeniority']>>()
    expectTypeOf<string>().toExtend<
      NonNullable<NonNullable<SearchPeopleParams['location']>['area']>
    >()
    expectTypeOf<string>().toExtend<NonNullable<FindEmailParams['emailType']>>()
    expectTypeOf<string>().not.toExtend<
      NonNullable<SearchPeopleParams['experience']>[number]['dimension']
    >()
    expectTypeOf<SearchPeopleParams['perPage']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<SearchPeopleParams['isOpenToWork']>().toEqualTypeOf<boolean | undefined>()
  })
})
