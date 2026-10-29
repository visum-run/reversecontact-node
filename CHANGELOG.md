# Changelog

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
- All 21 production V2 snapshot operations.
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
