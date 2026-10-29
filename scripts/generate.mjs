import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const snapshot = new URL('../../openapi/public-v2.json', import.meta.url)
if (!existsSync(snapshot)) {
  console.log(
    'Skipping type generation: the monorepo OpenAPI snapshot is absent. Using committed types.'
  )
} else {
  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/openapi-typescript/bin/cli.js', import.meta.url)),
      fileURLToPath(snapshot),
      '-o',
      fileURLToPath(new URL('../src/generated/openapi.ts', import.meta.url)),
      '--default-non-nullable',
      'false'
    ],
    { stdio: 'inherit' }
  )
}
