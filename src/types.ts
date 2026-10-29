import type { components, operations } from './generated/openapi'

export type { components, operations, paths } from './generated/openapi'
export type Body<K extends keyof operations> = operations[K] extends {
  requestBody: { content: { 'application/json': infer B } }
}
  ? B
  : never
export type Query<K extends keyof operations> = NonNullable<operations[K]['parameters']['query']>
type Success<R> = R[Extract<keyof R, 200 | 201 | 202>]
export type Data<K extends keyof operations> =
  Success<operations[K]['responses']> extends {
    content: { 'application/json': { data: infer D } }
  }
    ? Exclude<D, undefined>
    : never

export interface LimitInfo {
  limit: number
  used: number
  left: number
  nextReset: string
}
export interface CreditLimit extends Omit<LimitInfo, 'nextReset'> {
  nextReset: string | null
}
export interface Quotas {
  creditsConsumed: number
  workspace: {
    id: string
    credits: { total: number | null; used: number | null; left: number | null }
    hasUnlimitedCredits: boolean | null
    allowDailyOvercost: boolean | null
    minuteRateLimit: LimitInfo | null
    dailyLimit: LimitInfo | null
  }
  key: {
    id: string
    minuteRateLimit: LimitInfo | null
    dailyLimit: LimitInfo | null
    creditLimits: {
      daily: CreditLimit | null
      monthly: CreditLimit | null
      total: CreditLimit | null
    }
  } | null
}
export interface Metadata {
  requestId: string
  executionTimeMs: number
  updatedAt?: string
}
export interface Result<T> {
  data: T
  quotas?: Quotas
  metadata?: Metadata
  /** The original response. Its body has already been consumed. */
  response: Response
}
export type Person = components['schemas']['PersonFull']
export type Company = components['schemas']['CompanyFull']
export type EnrichPersonParams = Body<'enrichPerson'>
export type EnrichCompanyParams = Body<'enrichCompany'>
export type SearchPeopleParams = Body<'searchPeople'>
export type SearchPeopleByPromptParams = Body<'searchPeopleByPrompt'>
export type SearchPeopleLookalikeParams = Body<'searchPeopleLookalike'>
export type SearchOrganizationsParams = Body<'searchOrganizations'>
export type SearchOrganizationsByPromptParams = Body<'searchOrganizationsByPrompt'>
export type FetchPersonParams = Body<'fetchPerson'>
export type FetchCompanyParams = Body<'fetchCompany'>
export type FindEmailParams = Body<'findContactEmail'>
export type FindPhoneParams = Body<'findContactPhone'>
export type JobStatus = components['schemas']['PollWebhookData']['status']
export type JobAcknowledgement = Required<components['schemas']['JobAckData']>
export type JobSnapshot<T = unknown> = Omit<components['schemas']['PollWebhookData'], 'result'> & {
  result: T | null
}
export type ContactValue = { value: string; type: string }
export type Usage = Result<null>
