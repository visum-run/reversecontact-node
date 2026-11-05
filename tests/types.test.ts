import { expectTypeOf, it } from 'vitest'
import type ReverseContact from '../src'
import type {
  BulkTask,
  BulkTaskRows,
  Company,
  ContactValue,
  Data,
  Job,
  JobAcknowledgement,
  JobSnapshot,
  JobStatus,
  ListOperation,
  Person,
  Quotas,
  Result,
  SearchPeopleParams,
  Task,
  TaskAcknowledgement,
  TaskResultLine,
  TaskSnapshot,
  TaskStatus,
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
    Task<Person>
  >()
  expectTypeOf<Awaited<ReturnType<ReverseContact['contact']['findEmail']>>>().toEqualTypeOf<
    Task<ContactValue[]>
  >()
  expectTypeOf<Awaited<ReturnType<ReverseContact['usage']['retrieve']>>>().toEqualTypeOf<Usage>()
  expectTypeOf<TaskSnapshot<Person>['result']>().toEqualTypeOf<Person | null>()
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
  expectTypeOf<Task<ContactValue[]>['replayed']>().toEqualTypeOf<boolean>()
  expectTypeOf<Awaited<ReturnType<Task<Person>['wait']>>>().toEqualTypeOf<
    Result<TaskSnapshot<Person>>
  >()
  expectTypeOf<Task<Person>['data']>().toEqualTypeOf<TaskAcknowledgement>()
  expectTypeOf<TaskAcknowledgement['webhookId']>().toEqualTypeOf<string>()
  expectTypeOf<Awaited<ReturnType<ReverseContact['tasks']['wait']>>>().toEqualTypeOf<
    Result<TaskSnapshot<unknown>>
  >()
  expectTypeOf<ReverseContact['jobs']>().toEqualTypeOf<ReverseContact['tasks']>()
  expectTypeOf<Job<Person>>().toEqualTypeOf<Task<Person>>()
  expectTypeOf<JobSnapshot<Person>>().toEqualTypeOf<TaskSnapshot<Person>>()
  expectTypeOf<JobAcknowledgement>().toEqualTypeOf<TaskAcknowledgement>()
  expectTypeOf<JobStatus>().toEqualTypeOf<TaskStatus>()
  type Imported = Awaited<ReturnType<ReverseContact['lists']['importSignals']>>['data']
  expectTypeOf<Imported['task']>().toEqualTypeOf<Record<string, unknown> | undefined>()
  expectTypeOf<ReturnType<ReverseContact['withOptions']>>().toEqualTypeOf<ReverseContact>()
  type RowsPage = Awaited<ReturnType<ReverseContact['bulk']['rows']>>
  expectTypeOf<RowsPage['data']>().toEqualTypeOf<TaskResultLine[]>()
  expectTypeOf<BulkTaskRows['items']>().toEqualTypeOf<TaskResultLine[]>()
  expectTypeOf<ReturnType<ReverseContact['bulk']['iterateRows']>>().toEqualTypeOf<
    AsyncGenerator<TaskResultLine, void, unknown>
  >()
  type Submitted = Awaited<ReturnType<ReverseContact['bulk']['enrichPersons']>>['data']
  expectTypeOf<NonNullable<Submitted['task']>['taskName']>().toEqualTypeOf<string>()
  expectTypeOf<Parameters<ReverseContact['bulk']['enrichPersons']>[0]['taskName']>().toEqualTypeOf<
    string | undefined
  >()
  expectTypeOf<BulkTask['taskName']>().toEqualTypeOf<string>()
  expectTypeOf<Awaited<ReturnType<ReverseContact['bulk']['wait']>>>().toEqualTypeOf<
    Result<BulkTask>
  >()
  expectTypeOf<Parameters<ReverseContact['bulk']['results']>[1]>().toEqualTypeOf<
    { format?: 'csv' | 'ndjson' } | undefined
  >()
})
