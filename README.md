# Reverse Contact TypeScript SDK

[![npm version](https://img.shields.io/npm/v/@reverse-contact/sdk)](https://www.npmjs.com/package/@reverse-contact/sdk)
[![CI](https://img.shields.io/github/actions/workflow/status/visum-run/reversecontact-node/ci.yml?branch=main&label=CI)](https://github.com/visum-run/reversecontact-node/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@reverse-contact/sdk)](https://github.com/visum-run/reversecontact-node/blob/main/LICENSE)

Reverse Contact is a B2B data API: enrich people and companies, fetch profiles, search people
and organizations, and find email addresses and phone numbers.

This is the official TypeScript and JavaScript client for the Reverse Contact V2 API: typed
results, automatic retries, cursor pagination and asynchronous jobs, with no runtime dependencies.

[Documentation](https://docs.reversecontact.com/sdk/javascript) ·
[API reference](https://docs.reversecontact.com/api-reference) ·
[Get an API key](https://app.reversecontact.com) ·
[Changelog](https://github.com/visum-run/reversecontact-node/blob/main/CHANGELOG.md)

## Installation

```sh
npm install @reverse-contact/sdk
```

The package also installs with `pnpm add`, `yarn add`, `bun add`, or `deno add npm:@reverse-contact/sdk`.
It runs on Node.js 22 or later, Bun, Deno, and edge runtimes (see Requirements below).

## Quickstart

Create an API key in the [Reverse Contact app](https://app.reversecontact.com) and export it:

```sh
export RC_API_KEY="your-api-key"
```

Save this file as `quickstart.mjs` and run `node quickstart.mjs`, or save it as `quickstart.ts`
and run `bun quickstart.ts`:

```ts
import ReverseContact from '@reverse-contact/sdk'

const client = new ReverseContact({ apiKey: process.env.RC_API_KEY })

const match = await client.enrich.person({ email: 'jane@example.com' })
if (match === null) {
  console.log('No confident match')
} else {
  console.log(match.data.person)
  console.log('Full profile:', match.data.isFullProfile)
  console.log('Request id:', match.metadata?.requestId)
  console.log('Credits used:', match.quotas?.creditsConsumed)
}
```

A lookup without a match returns `null` and costs nothing.

Pass your key as `apiKey`, from any server-side source: an environment variable as above, a
secret manager, or one client per key when you serve several workspaces. When `apiKey` is
omitted, the client reads `RC_API_KEY`.

Keep the key in your server environment. Never put it in browser code.
Construction in a browser throws unless you explicitly set `dangerouslyAllowBrowser: true`.
This opt-out exposes your key to the browser user; use a backend for customer applications.

## Resources

| Resource | Methods | Returns |
| --- | --- | --- |
| `client.enrich` | `person`, `company` | The matched profile, or `null` when nothing matches |
| `client.fetch` | `person`, `company` | A cached profile, or `null` when nothing matches |
| | `checkPerson`, `checkCompany` | Whether a profile exists and how fresh it is (free) |
| | `personLive`, `companyLive` | A `Job` that fetches a fresh profile |
| `client.search` | `people`, `peopleByPrompt`, `peopleLookalike` | A `Page` of people |
| | `organizations`, `organizationsByPrompt` | A `Page` of organizations |
| | `iterPeople`, `iterPeopleByPrompt`, `iterPeopleLookalike`, `iterOrganizations`, `iterOrganizationsByPrompt` | An async iterator over results, bounded by `maxResults` |
| | `countPeople`, `countOrganizations` | The number of matches (free) |
| | `peopleFields`, `organizationsFields` | The available search filters (free) |
| `client.contact` | `findEmail`, `findPhone` | A `Job` that finds email addresses or phone numbers |
| `client.jobs` | `retrieve`, `wait` | One job snapshot, or the final job result |
| `client.usage` | `retrieve` | Credit balance and rate limits, in `quotas` (free) |

Every method accepts request options as its last argument (see Configuration). Credit costs
per endpoint are listed in the [API reference](https://docs.reversecontact.com/api-reference).

## Usage

### Enrich and fetch profiles

```ts
const company = await client.enrich.company({ domain: 'example.com' })
const saved = await client.fetch.company({ url: 'https://social.com/company/acme' })
const personExists = await client.fetch.checkPerson({ url: 'https://social.com/in/janedoe' })
const companyExists = await client.fetch.checkCompany({ url: 'https://social.com/company/acme' })
const liveCompany = await client.fetch.companyLive({ url: 'https://social.com/company/acme' })
```

`enrich.person`, `enrich.company`, `fetch.person`, and `fetch.company` return `null`
for HTTP 404 no-match results. These lookups are free when no match is found.
An unknown API route still raises `NotFoundError`. Other resources always raise on 404.
Check `isFullProfile` before using full-profile-only enrichment fields.

Fetch returns the profile directly in `result.data`. Enrichment nests it in
`result.data.person` or `result.data.company`. The checks are free, but the API can still
require a sufficient workspace balance.

### Search

Count before searching:

```ts
const filters = { firstName: 'Jane' }
const count = await client.search.countPeople(filters) // free
console.log('Matches:', count.data.count)

for await (const person of client.search.iterPeople(filters, { maxResults: 10 })) {
  console.log(person.id, person.firstName)
}
```

Search is billed per delivered result. Every search iterator requires `maxResults`.
It requests at most that many results and lowers `perPage` on the last request.
`maxResults: 0` makes no request. An iterator fetches lazily, without prefetching.
The maximum is a result budget, not a monetary credit ceiling; check your plan and quota metadata.

The other search methods, and the filter catalogs:

```ts
const fields = await client.search.peopleFields()
const organizationFields = await client.search.organizationsFields()
const page = await client.search.people({ firstName: 'Jane', perPage: 10 })
const prompt = await client.search.peopleByPrompt({ prompt: 'Software founders in Paris', perPage: 10 })
console.log(prompt.interpretation)
const similar = await client.search.peopleLookalike({ url: 'https://social.com/in/janedoe', perPage: 10 })
const organizations = await client.search.organizations({ companyName: 'Acme', perPage: 10 })
const byPrompt = await client.search.organizationsByPrompt({ prompt: 'Software companies in France', perPage: 10 })
const organizationCount = await client.search.countOrganizations({ companyName: 'Acme' })
```

Iterators: `iterPeople`, `iterPeopleByPrompt`, `iterPeopleLookalike`,
`iterOrganizations`, and `iterOrganizationsByPrompt`. All accept the same search filters
as their page method, an optional `perPage` (default 25), and required `{ maxResults }`.
Search and count requests require at least one filter; a pagination setting alone is not a filter.

### Live fetch

```ts
const params = { url: 'https://social.com/in/janedoe' }
const cached = await client.fetch.person(params)
if (cached) {
  console.log(cached.data)
} else {
  const job = await client.fetch.personLive(params)
  console.log('Persist this id:', job.id)
  const completed = await job.wait()
  console.log(completed.data.result)
}
```

Live fetches are asynchronous. Save the job id before waiting so a restart does not create
the same paid job again. The SDK does not validate Social URL domains.

### Find email addresses and phone numbers

```ts
const emailJob = await client.contact.findEmail({
  fullName: 'Jane Doe',
  companyDomain: 'example.com',
  emailType: 'professional'
})
const emails = await emailJob.wait()
for (const email of emails.data.result ?? []) console.log(email.value, email.type)

const phoneJob = await client.contact.findPhone({ url: 'https://social.com/in/janedoe' })
const phones = await phoneJob.wait()

// A person id from a search, fetch or enrich result replaces the URL.
const idJob = await client.contact.findEmail({ id: 'prs_01jbd5vewyenebxgaz869ffe5t' })
```

Each finder takes one person: `url`, `id` (a `prs_…` person id), or a name with
`companyDomain`. An id that matches no person is refused with an `UnprocessableEntityError`
before any job starts. Both finders return arrays of `{ value, type }` in the final job result. Some workspaces
cannot use the phone endpoint; a `GoneError` exposes the API's `alternative` when provided.

#### Safe retries

Both contact finders send a fresh UUID v4 as `Idempotency-Key` for each call and reuse it
across all automatic retries. The API keeps a successful acknowledgement for 24 hours,
scoped to the workspace and endpoint. Reusing a key with the same body returns that
acknowledgement without starting or charging for another job.

Persist your own key with the request body to survive a process restart:

```ts
const retryableJob = await client.contact.findEmail({
  fullName: 'Jane Doe',
  companyDomain: 'example.com'
}, { idempotencyKey: 'email-request-2026-10-29-001' })
console.log(retryableJob.replayed)
```

An explicit `Idempotency-Key` request header is also accepted; the `idempotencyKey` option
has priority. Keys must contain 1 to 255 printable ASCII characters, without spaces. Invalid caller keys raise `ReverseContactError` before any request.

- Contact submits retry timeouts, interrupted response bodies and ambiguous connection
  failures with the same key.
- HTTP 409 `IDEMPOTENCY_KEY_IN_USE` waits for `Retry-After` within `maxRetries`.
- HTTP 422 `IDEMPOTENCY_KEY_REUSED` and 400 `INVALID_IDEMPOTENCY_KEY` are never retried.
- `job.replayed` is true when the acknowledgement has `Idempotent-Replayed: true`;
  the original header remains available in `job.response.headers`.
- A terminal job failure does not create a new job automatically.
- After 24 hours, reusing a key can start and charge for a new job; resume a known job id
  with `client.jobs.wait`.

### Credit balance and rate limits

```ts
const usage = await client.usage.retrieve()
console.log(usage.quotas?.workspace.credits.left)
console.log(usage.quotas?.workspace.minuteRateLimit?.left)
```

Usage has `data: null`; balance and limit information lives in `quotas`.
Quota values can be `null` when no snapshot is available, and `quotas.key` can be null.
`null`, `0`, and an empty array retain their distinct meanings.

## Configuration

```ts
const client = new ReverseContact({
  apiKey: process.env.RC_API_KEY,
  baseUrl: 'https://api.reversecontact.com',
  timeout: 90_000,
  maxRetries: 4,
  defaultHeaders: { 'X-Integration-Version': '1' },
  appInfo: { name: 'my-integration', version: '1.0.0' },
  fetch: globalThis.fetch
})
```

| Option | Default | Meaning |
| --- | --- | --- |
| `apiKey` | `RC_API_KEY` | Bearer token, including OAuth tokens; no prefix restriction |
| `baseUrl` | `RC_BASE_URL`, then `https://api.reversecontact.com` | Origin or gateway prefix; SDK paths include `/v2` |
| `timeout` | `90_000` | Milliseconds per HTTP attempt, including response body reading |
| `maxRetries` | `4` | Retries after the first attempt, five attempts total |
| `defaultHeaders` | none | Headers added to each request |
| `fetch` | global Fetch API | Custom transport for proxies or tests |
| `appInfo` | none | `{ name, version?, url? }`; only name and version enter User-Agent |
| `dangerouslyAllowBrowser` | `false` | Explicitly override the server-side key guard |
| `logLevel` | `off`, or `debug` when `RC_LOG=debug` | Log method, path, status, attempt, delay in milliseconds, and request id |

`withOptions` returns a new client with merged options and headers, using the same Fetch
transport and connection pool unless you supply another `fetch`. The original client is unchanged:

```ts
const debugClient = client.withOptions({ timeout: 120_000, logLevel: 'debug' })
await debugClient.usage.retrieve()
```

Debug output excludes API keys, request headers, query parameters, and request bodies.
Use `logLevel: 'off'` to disable it even when `RC_LOG=debug`.
The reserved `X-Request-Origin` header is removed after merging client and request headers.

### Request options

Every operation accepts request options as its last argument: `timeout`, `maxRetries`,
`headers`, and `signal`. Path ids precede the body or query object. For methods without
a body or query, options follow the path ids directly:

```ts
const controller = new AbortController()
await client.jobs.retrieve('job-id', { wait: 20 }, {
  timeout: 95_000,
  maxRetries: 1,
  signal: controller.signal
})
await client.usage.retrieve({ signal: controller.signal })
```

The User-Agent identifies the SDK version and runtime, with optional integration name/version.
`VERSION` is available as a named export.

## Pagination

Page methods return a `Page` with:

- `data`: the items array (search's nested `data.data` is unwrapped).
- `nextCursor`, `hasNextPage()`, and `await getNextPage()`.
- `quotas`, top-level request `metadata`, and the original HTTP `response`.
- `count` and `perPage` when present, plus typed `interpretation` on prompt searches.
- `extras` for payload fields other than the items and pagination metadata.

`getNextPage()` preserves the original filters and request options and returns `null`
when there is no next cursor. An explicit page request can spend credits; the search
result guard applies to the iterator helpers. The API uses cursors, never page numbers.
Search `perPage` is an integer from 1 through 100.
Pages and iterators snapshot filters, including nested objects, at creation. Later changes
to your input object cannot alter subsequent requests. Iterators reject invalid budgets
and page sizes before fetching and stop with an error if the API repeats a cursor.

## Jobs, deadlines, and cancellation

```ts
const snapshot = await client.jobs.retrieve('stored-job-id', { wait: 20 })
const finished = await client.jobs.wait('stored-job-id', {
  timeout: 30 * 60 * 1000,
  pollWait: 20,
  onPoll: snapshot => console.log(snapshot.data.status)
})
```

Live fetch and contact calls return a generic `Job<T>`. It exposes `id`, `webhookId`,
`status`, `pollUrl`, `replayed`, `data` (the acknowledgement), `quotas`, `metadata`, and `response`.
`job.retrieve({ wait? }, options?)` reads one snapshot; `job.wait(options?)` and
`jobs.wait(id, options?)` return the final response, including `data.status`,
`data.result`, `data.creditsConsumed`, `data.eventType`, and `data.deliveryStatus`.

Waiting uses long polls with `wait=20` by default. `pollWait` must be an integer from 0
through 20. Each HTTP poll timeout is the larger of your client timeout and `pollWait + 15`
seconds, capped by the remaining overall deadline. The `wait` query is also capped by
the remaining whole seconds. The overall deadline interrupts an in-flight poll.
Early answers respect `Retry-After` (2 seconds by default),
measured between poll starts. A held poll can be followed immediately by another.
Polling retries up to five consecutive failing HTTP requests, independently of the
creating request's retry budget, and resets that counter after a successful HTTP response.

The default overall waiting deadline is 30 minutes. `JobTimeoutError` carries `jobId`
and `lastStatus`: the server job may still finish. Resume with `jobs.wait`.
Use `signal` to cancel HTTP requests, retry sleeps, and job waiting. Cancellation raises
`APIConnectionError` and stops local waiting; it does not cancel a server job.

A terminal `errored` status raises `JobFailedError`, which exposes `jobId`, `errorCode`,
`creditsConsumed`, `result` (which may contain partial data), and `notFound`.
A non-null `deliveryStatus` on a succeeded job does not make the job fail.
Expired results raise `GoneError`; unknown job ids raise `NotFoundError`.
The SDK never creates a replacement job after a terminal failure, even for
`fetch-data-error` or `result-unavailable`. The caller decides whether to pay for a new job.

## Errors and retries

```ts
import { APIError, DailyLimitError, KeyCreditLimitError, JobTimeoutError } from '@reverse-contact/sdk'

try {
  await client.usage.retrieve()
} catch (error) {
  if (error instanceof DailyLimitError || error instanceof KeyCreditLimitError) {
    console.error('Quota limit:', error.code, error.retryAfter, error.resetAt)
  } else if (error instanceof APIError) {
    console.error(error.status, error.code, error.message, error.details, error.requestId)
  } else {
    throw error
  }
}
```

All SDK errors extend `ReverseContactError`. HTTP errors extend `APIError` and retain
`status`, `code`, `message`, `details`, `requestId`, `headers`, and the parsed `body`
(or original text for non-JSON errors). The original `response` on successful results
has already been read once; use `result.data` for the parsed content.

| HTTP status | Error class |
| --- | --- |
| 400 | `BadRequestError` |
| 401 | `AuthenticationError` |
| 402 | `InsufficientCreditsError` |
| 403 | `PermissionDeniedError` |
| 404 | `NotFoundError` (except lookup no-match) |
| 409 | `ConflictError` |
| 410 | `GoneError` |
| 422 | `UnprocessableEntityError` |
| 429 | `RateLimitError`, or `DailyLimitError` for daily limits |
| 451 | `UnavailableForLegalReasonsError` |
| 5xx | `InternalServerError` |
| Other | `APIError` |

`KEY_CREDIT_LIMIT_REACHED` becomes `KeyCreditLimitError` regardless of HTTP status.
It exposes `period`, `limit`, `used`, `required`, `retryAfter`, and `resetAt` when supplied.
Validation details, including errors and suggestions, are preserved without modification.
Non-JSON gateway failures use `HTTP_<status>` and the message `The response is not JSON`.
Network failures raise `APIConnectionError`; per-attempt deadlines raise `APITimeoutError`.
An unreadable response body retains its HTTP status: errors use their normal HTTP class
and `HTTP_<status>` code, while successful responses raise `APIConnectionError` with `status`.

The default is four retries after the initial attempt:

- Ordinary 429 responses use `details.retryAfter`, then `Retry-After`, then backoff.
  A requested delay above 60 seconds raises immediately.
- Daily limits and key credit limits are never retried.
- HTTP 500, 502, 503, and 504 use exponential backoff with jitter, honoring
  `Retry-After` or `details.retryAfterSeconds` when present. A delay above 60 seconds raises immediately.
- GET and DELETE connection failures before response headers use the same backoff. Other POST operations
  retry only if the connection was never established: `ECONNREFUSED`, `ENOTFOUND`,
  `EAI_AGAIN`, `ENETUNREACH`, `EHOSTUNREACH`, or `UND_ERR_CONNECT_TIMEOUT` in the Fetch error cause.
  The first retry waits 2 seconds plus
  0 through 250 milliseconds of jitter; the exponential part caps at 15 seconds.
- GET and the two contact submits retry unreadable successful bodies and attempt timeouts.
  Contact submits also retry ambiguous connection failures using the same idempotency key.
  Other POST operations do not retry these failures, because the request may already be billed.
  An unreadable error body follows its HTTP status retry rule. Only contact submits retry
  HTTP 409 `IDEMPOTENCY_KEY_IN_USE`, honoring `Retry-After`; other 409 errors are raised.

Set `maxRetries: 0` to disable request retries. An HTTP retry is distinct from creating
a new job after a completed job has failed.

## Webhook deliveries

Pass `webhookUrl` when creating a live fetch or contact job to receive a push delivery.
The body is `{ webhookId, data }`, separate from the normal V2 response envelope:

```ts
import { parseWebhookDelivery } from '@reverse-contact/sdk'

const delivery = parseWebhookDelivery(receivedBody)
console.log(delivery.webhookId, delivery.isError, delivery.data)
```

The helper validates the wrapper and preserves data. If present, `data.errorCode` must be
a string or null; `isError` is true only for a non-empty string.
A generic type parameter can describe your endpoint's result; it does not
perform deep profile validation. Use HTTPS, correlate with your stored job id,
deduplicate on `webhookId`, answer 2xx within 10 seconds, and process asynchronously.
See the [webhooks guide](https://docs.reversecontact.com/guides/webhooks).

## Types

Types are generated from the Reverse Contact OpenAPI description. Public aliases include
`Person`, `Company`, `EnrichPersonParams`, `SearchPeopleParams`, `SearchOrganizationsParams`,
`JobStatus`, `JobSnapshot<T>`, `Usage`, `Quotas`, and `Metadata`.
Use `Body<'operationId'>`, `Query<'operationId'>`, `Data<'operationId'>`, or the exported
`components`, `operations`, and `paths` types for the complete schema surface.
Quota types model runtime nullable fields independently of the schema. Response parsing
keeps unknown fields and does not replace nulls or empty values.

## Best practices

- Keep keys server-side, with one key per environment.
- Use free counts to estimate search volume before retrieving paid rows.
- Read cached profiles before requesting live fetches, and handle nullable no-match results.
- Persist job ids before waiting; resume them after a restart.
- Pace bulk requests using `quotas.workspace.minuteRateLimit` and your plan's limits.
- Log request ids and job ids; monitor balance, repeated quota errors, and server errors.
- Prefer the default 90-second HTTP timeout: legitimate enrichment requests can exceed 60 seconds.

See [authentication](https://docs.reversecontact.com/authentication),
[errors and retries](https://docs.reversecontact.com/guides/errors-retries),
[polling](https://docs.reversecontact.com/guides/polling),
[credits](https://docs.reversecontact.com/guides/credits), and the
[production checklist](https://docs.reversecontact.com/guides/production-checklist).

## Requirements

- Node.js 22 or later, Bun, Deno, or an edge runtime with the standard Fetch APIs,
  `AbortController`, and Web Crypto (`crypto.randomUUID`).
- ESM and CommonJS are both supported, with TypeScript declarations:
  `import ReverseContact from '@reverse-contact/sdk'` or
  `const { ReverseContact } = require('@reverse-contact/sdk')`.
- No runtime dependencies.

A Node.js release line stays supported until its end of life; the next minor release of the
SDK then raises the minimum version.

## Versioning

The SDK follows [semantic versioning](https://semver.org). While the version is 0.x, a minor
release (for example 0.1 to 0.2) can change the API; patch releases do not. npm's default caret
range (`^0.1.1`) already stays within 0.1.x: keep it, or pin an exact version, and read the
[changelog](https://github.com/visum-run/reversecontact-node/blob/main/CHANGELOG.md) before
moving to a new minor version.

## Support

- SDK bugs and feature requests: [open an issue](https://github.com/visum-run/reversecontact-node/issues).
- Questions about your account, credits, or API results: email
  [support@reversecontact.com](mailto:support@reversecontact.com).

Include the request id (`metadata.requestId`, or `requestId` on an error) and any job id.

## Contributing

Issues and pull requests are welcome. This repository is published from Reverse Contact's main
codebase with each release: an accepted pull request is applied there first, then reaches this
repository and npm with the next release.

### Development

From the repository root:

```sh
bun install --frozen-lockfile
bun run generate
bun run lint
bun run typecheck
bun run test
bun run build
bun run check:package
bun run check:consumer
node scripts/smoke-dist.mjs
```

The build toolchain uses Node.js 24 and Bun 1.3.14. Runtime CI covers Node.js 22, 24, and 26.
Types are generated from the API's OpenAPI description and committed. The generator and the
tests that compare the SDK with that description need input files this repository does not
include: they skip with an explicit reason, and every other check runs here.

Tests use mocked Fetch transports. The live smoke is skipped by default. To opt in
against your configured environment, set `RC_SDK_LIVE=1`, `RC_API_KEY`, and optionally
`RC_BASE_URL`, then run `bun run test -- tests/live.test.ts`. It calls only usage,
people fields, people count, organization count, and person check, and asserts zero credits.

The [examples](https://github.com/visum-run/reversecontact-node/tree/main/examples) run from
a checkout: `bun examples/enrich-person.ts`, `bun examples/search-people.ts`,
`bun examples/live-fetch.ts`, or `bun examples/find-email.ts`.
They read `RC_API_KEY` and may consume credits. URLs and email addresses are illustrative;
replace them with your intended inputs.

## License

Apache-2.0. See [LICENSE](https://github.com/visum-run/reversecontact-node/blob/main/LICENSE).
