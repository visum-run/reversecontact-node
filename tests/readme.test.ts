import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('typechecks every TypeScript README example without executing API requests', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  const examples = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map(match => match[1] ?? '')
  expect(examples.length).toBeGreaterThan(10)
  const source = `
    import ReverseContact, { APIError, Area, DailyLimitError, Industry, KeyCreditLimitError, JobTimeoutError, parseWebhookDelivery, Seniority } from '../src'
    declare const receivedBody: unknown
    ${examples
      .map(
        (code, index) => `async function example${index}() {
      ${code.includes('const client =') ? '' : 'const client = new ReverseContact()'}
      ${code.replace(/^import .*$/gm, '')}
    }`
      )
      .join('\n')}
  `
  const filename = fileURLToPath(new URL('./readme-examples.ts', import.meta.url))
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: true,
    noEmit: true
  }
  const host = ts.createCompilerHost(options)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) =>
    path === filename
      ? ts.createSourceFile(path, source, languageVersion, true)
      : getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile)
  const program = ts.createProgram([filename], options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  expect(
    diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
  ).toEqual([])
})
