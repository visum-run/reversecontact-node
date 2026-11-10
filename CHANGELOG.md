# Changelog

## 0.5.0 (2026-11-10)

- Search autocomplete is now `search.peopleAutoCompletionFields`: it calls `POST /v2/search/people/auto-completion-fields`, the new path of the endpoint, and reads the values under `data.completions` (`object: "search_auto_completions"`). The request does not change.
- `search.peopleAutoSuggestion` is deprecated. It keeps working as before: it calls the former path, which still answers, and returns the values under `suggestions` (`PeopleAutoSuggestionData`).

## 0.4.2 (2026-11-10)

- `search.peopleAutoSuggestion` completes eight more People filters from what the profiles hold, most common first: `field` takes `languages`, `positionTitle`, `currentPositionTitle`, `companyName`, `currentCompanyName`, `schoolName`, `city` and `region` besides `skills`, `industry`, `countryCode` and `area`. Each name is the filter the value goes back into (`city` and `region` are `location.city` and `location.region`). These values come in lowercase, as the profiles are indexed (`software engineer`, `sao paulo`), and their `label` is the value itself.
- A `query` now has a minimum length per field: 3 characters for `positionTitle`, `currentPositionTitle`, `companyName` and `currentCompanyName`, 2 for `skills`, `languages`, `schoolName`, `city` and `region`, 1 for `industry`, `countryCode` and `area`. A shorter query is refused with a 422 (`UnprocessableEntityError`, code `VALIDATION_ERROR`) that names the minimum. A one-letter `skills` query was accepted before.

## 0.4.1 (2026-11-09)

- `bulk.enrichPersons` takes `families: ['check']`: the free person check of each item that has a profile URL (`linkedinUrl`), at no cost. It tells whether the profile is in the database, when it was last updated and how much of it there is. It runs alone, not with another family nor with `live`. Each `TaskResultLine` of such a task carries `check` (`exists`, `lastUpdate`, `experienceCount`, `skillCount`, `schoolCount`), and its `status` reads `found` or `not_found`.
- `search.peopleAutoSuggestion` completes industries, country codes and areas too: `field` takes `industry`, `countryCode` and `area` besides `skills`. A country answers to its ISO code or its name (`FR` and `fran` both give France first), an area to its id, acronym or name (`DACH`). Each suggestion now carries `label`, the text to show, next to `value`, the text to send in the filter (`{ value: 'FR', label: 'France' }`; a skill's label is the skill itself).
- `lists.export` accepts `{ format: 'ndjson' }` and returns one `ListExportLine` JSON object per line: the row `lists.members.list` returns, then `person` (a persons List, in the `/v2/enrich/persons` shape), `company` (a companies List, or the Company details of a person member, in the `/v2/enrich/companies` shape), `isFullProfile` and `customColumns`. The CSV stays the default, and `{ fields: '...' }` chooses its columns. The request options now come third, `lists.export(listId, params, options)`, like `bulk.results`; `lists.export(listId, options)` keeps working and is deprecated. `ListExportLine` is an exported type.

## 0.4.0 (2026-11-05)

- Breaking: the background jobs of the Bulk API are now called tasks, with no compatibility for the old routes. `client.bulk` keeps every method name (`enrichPersons`, `list`, `listAll`, `retrieve`, `wait`, `results`, `rows`, `iterateRows`, `cancel`); what changes:
  - `bulk.enrichPersons` posts to `/v2/bulk` (was `/v2/enrich/persons/bulk`) and the other methods call `/v2/tasks`, `/v2/tasks/{taskId}`, `/v2/tasks/{taskId}/results`, `/v2/tasks/{taskId}/rows` and `/v2/tasks/{taskId}/cancel` (were under `/v2/jobs`).
  - `bulk.enrichPersons` takes `taskName` (was `name`) and its answer holds the task in `data.task` (was `data.job`).
  - The task object carries `taskName` (was `name`); its `links.self` and `links.results` point to `/v2/tasks/<id>`.
  - Renamed types: `BulkJob` is `BulkTask`, `JobResultLine` is `TaskResultLine`, `BulkJobRows` is `BulkTaskRows`. The operation ids of `Body`, `Query` and `Data` are `listTasks`, `getTask`, `getTaskResults`, `getTaskRows` and `cancelTask` (were `listJobs`, `getJob`, `getJobResults`, `getJobRows` and `cancelJob`); `bulkEnrichPersons` is unchanged.
  - Error codes say TASK: `TASK_NOT_FOUND`, `TASK_INVALID_INPUT`, `TASK_NOT_CANCELLABLE`, `TASK_RESULTS_NOT_READY`, `TASK_RESULTS_FORMAT_UNAVAILABLE`, `TASK_ROWS_BUSY`, `TASK_STARTED_BY_A_PERSON`, `TASK_MAX_CREDITS`, and `BULK_TASK_*` for the former `BULK_JOB_*` codes (for example `BULK_TASK_INSUFFICIENT_CREDITS`).
  - The webhook sent when a task created with `webhookUrl` settles is the event `task.updated` (was `job.updated`), with `taskId` (was `jobId`); `pollUrl` and `resultsUrl` point to `/v2/tasks/<id>`.
- The async tasks of live fetches and contact lookups say task too; every former name stays exported as a deprecated alias of the same object, class or type:
  - `client.tasks` reads and waits for them by id (`retrieve`, `wait`, on `GET /v2/webhooks/{webhookId}`); `client.jobs` is the same object, kept as a deprecated alias.
  - `fetch.personLive`, `fetch.companyLive` and the `contact` methods return a `Task` (was `Job`, kept as an alias, so `instanceof Job` still matches).
  - `TaskTimeoutError` and `TaskFailedError` carry `taskId` (`jobId` reads the same value); `JobTimeoutError` and `JobFailedError` are the same classes, so `instanceof` works with either name. Their `name` and message now say task.
  - The types are `TaskAcknowledgement`, `TaskSnapshot<T>` and `TaskStatus`; `JobAcknowledgement`, `JobSnapshot<T>` and `JobStatus` stay as aliases. In `components`, the acknowledgement schema is `TaskAckData` (was `JobAckData`).
- `lists.importSignals` answers with the task record in `data.task` (was `data.job`).
- The types describe the CSV of `lists.export` as the API returns it: members and Not found rows mixed in the order they were added (previously: members, then Not found rows).

## 0.3.0 (2026-11-04)

- `bulk.rows` reads the results of a Bulk enrich job a page at a time (`cursor`, `limit` up to 100), in the order sent, from the start of the run; each item is a `JobResultLine` and the page carries the job status in `extras.status`. `bulk.iterateRows` yields the results one at a time as they become ready: it waits `Retry-After` while the next item runs, and ends with the job or when it is paused; a cancelled job first finishes the items it had started, within the hour. Free.
- `bulk.results` accepts `{ format: 'ndjson' }` and returns one `JobResultLine` JSON object per line; the CSV stays the default. In both, an item a cancelled job had started and not finished yet reads `running`.
- `JobResultLine` and `BulkJobRows` are exported types.

## 0.2.0 (2026-11-04)

- `lists` manages your saved lists: `list`, `listAll`, `create`, `retrieve`, `delete`, `export` (CSV) and `importSignals`.
- `lists.members` reads, adds and removes the members of a list: `list`, `listAll`, `add` and `remove`.
- `lists.operations` follows an import: `retrieve`, `cancel` and `wait`.
- `bulk.enrichPersons` starts a Bulk enrich job of up to 25,000 people. `bulk.list`, `bulk.listAll`, `bulk.retrieve`, `bulk.wait`, `bulk.results` (CSV) and `bulk.cancel` list, follow, download and stop these jobs.

## 0.1.8 (2026-11-03)

- `search.peopleAutoSuggestion` returns the skills that start with what someone has typed, most common first, to build a search box in your own product. Free.
- `search.people`, `search.countPeople` and their iterator accept `schoolId` and `schoolLinkedinId`.

## 0.1.7 (2026-11-03)

- `contact.verifyEmail` checks whether an email address can receive mail. It returns a `Job` whose result holds `email` and `status`: `valid`, `risky`, `invalid` or `unknown`. The verdicts are exported as `EmailVerificationStatus`, and each submit carries an `Idempotency-Key` like the finders.

## 0.1.6 (2026-10-30)

- `search.people`, `search.organizations`, `search.countPeople` and `search.countOrganizations` accept `location.area`, one zone id or a list (`'MR:EMEA'`, `['MC:DACH', 'IG:EU']`): main regions, UN regions and subregions, market clusters and institutional groups.
- `search.people`, `search.countPeople` and their iterator accept `connectionsCount`, a connection count range where one bound is enough (`{ min: 501 }`).
- The closed lists of the API are exported as constants, each with the type of its values: `Industry`, `CountryCode`, `JobFunction`, `JobSubFunction`, `Seniority`, `ContractType`, `Area` and `EmailType` (`Industry.SOFTWARE_DEVELOPMENT`, `Area.MC_DACH`). The parameters bound to a list offer its values and still accept any string.

## 0.1.5 (2026-10-29)

- `contact.findEmail` and `contact.findPhone` accept `id`, a person id (`prs_…`) from a search, fetch or enrich result, in place of `url` or a name with company domain.

## 0.1.4 (2026-10-29)

- Types generated from the updated API description, which now documents counts, page sizes and other whole-number fields as integers. The TypeScript types are unchanged (`number`); only the generated documentation comments differ.

## 0.1.3 (2026-10-29)

- The README and the examples pass the API key explicitly: `new ReverseContact({ apiKey: process.env.RC_API_KEY })`. Without `apiKey`, the client still reads `RC_API_KEY`.
- `apiKey` accepts `undefined`, so `apiKey: process.env.RC_API_KEY` also compiles with `exactOptionalPropertyTypes`.

## 0.1.2 (2026-10-29)

- README rewritten for GitHub and npm: links to the documentation, a quickstart that runs as pasted, a table of every resource and method, requirements, versioning and support.
- An `idempotencyKey` that contains a space is refused before the request is sent, as the API refuses it.
- `JobFailedError.notFound` is also `true` for `phone-not-found`, the outcome of a phone lookup that finds no number.

## 0.1.1 (2026-10-29)

First npm release. Version 0.1.0 was tagged but never published.

- Initial official Reverse Contact TypeScript and JavaScript SDK.
- All 32 public V2 snapshot operations, including Lists.
- Typed results, quota metadata, HTTP errors, retries and cancellation.
- Generic job handles, resumable waiting and webhook delivery parsing.
- Cursor pages and search iterators with a required result budget.
- ESM and CommonJS builds with TypeScript declarations and no runtime dependencies.
- Safe retries for interrupted responses and polling bounded by the remaining deadline.
- Immutable pagination parameters, page extras, client option copies and opt-in debug logging.
- Published declarations checked in Node consumers without DOM libraries.
- Node.js 22+ baseline, ES2023 types, and standard Web Crypto for Bun, Deno, and edge runtimes.
- Apache-2.0 license.
- Idempotent email and phone submits, safe retries with stable keys, and acknowledgement replay flags.
- Standalone public repository checks and provenance-enabled releases of the tested npm tarball.
