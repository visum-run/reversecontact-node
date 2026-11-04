import { expectTypeOf, it } from 'vitest'
import type ReverseContact from '../src'
import type {
  Company,
  ContactValue,
  Data,
  Job,
  JobSnapshot,
  ListOperation,
  Person,
  Quotas,
  Result,
  SearchPeopleParams,
  Usage
} from '../src'

it('keeps generated response shapes and nullable lookups in the public API', () => {
  expectTypeOf<Awaited<ReturnType<ReverseContact['enrich']['person']>>>().toEqualTypeOf<Result<
    Data<'enrichPerson'>
  > | null>()
  expectTypeOf<
    Awaited<ReturnType<ReverseContact['fetch']['person']>>
  >().toEqualTypeOf<Result<Person> | null>()
  expectTypeOf<
    Awaited<ReturnType<ReverseContact['fetch']['company']>>
  >().toEqualTypeOf<Result<Company> | null>()
  expectTypeOf<Awaited<ReturnType<ReverseContact['fetch']['personLive']>>>().toEqualTypeOf<
    Job<Person>
  >()
  expectTypeOf<Awaited<ReturnType<ReverseContact['contact']['findEmail']>>>().toEqualTypeOf<
    Job<ContactValue[]>
  >()
  expectTypeOf<Awaited<ReturnType<ReverseContact['usage']['retrieve']>>>().toEqualTypeOf<Usage>()
  expectTypeOf<JobSnapshot<Person>['result']>().toEqualTypeOf<Person | null>()
  expectTypeOf<Quotas['workspace']['credits']['left']>().toEqualTypeOf<number | null>()
  expectTypeOf<Quotas['key']>().toBeNullable()
  expectTypeOf<SearchPeopleParams>().not.toBeAny()
  expectTypeOf<SearchPeopleParams['perPage']>().toEqualTypeOf<number | undefined>()
  type MemberPage = Awaited<ReturnType<ReverseContact['lists']['members']['list']>>
  expectTypeOf<MemberPage['memberCount']>().toEqualTypeOf<number | undefined>()
  expectTypeOf<MemberPage['pendingIntakeCount']>().toEqualTypeOf<number | undefined>()
  expectTypeOf<MemberPage['extras']>().toEqualTypeOf<Record<string, unknown>>()
  expectTypeOf<Awaited<ReturnType<ReverseContact['lists']['operations']['wait']>>>().toEqualTypeOf<
    Result<ListOperation>
  >()
  expectTypeOf<Job<ContactValue[]>['replayed']>().toEqualTypeOf<boolean>()
  expectTypeOf<Awaited<ReturnType<Job<Person>['wait']>>>().toEqualTypeOf<
    Result<JobSnapshot<Person>>
  >()
  expectTypeOf<ReturnType<ReverseContact['withOptions']>>().toEqualTypeOf<ReverseContact>()
})
