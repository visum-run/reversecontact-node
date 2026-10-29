import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const tarball = process.argv[2]
if (!tarball) throw new Error('Usage: node scripts/smoke-tarball.mjs <tarball>')
const temporary = mkdtempSync(fileURLToPath(new URL('../.smoke-', import.meta.url)))
try {
  writeFileSync(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  execFileSync(
    'npm',
    [
      'install',
      resolve(tarball),
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false'
    ],
    { cwd: temporary, stdio: 'inherit' }
  )
  copyFileSync(new URL('./smoke-dist.mjs', import.meta.url), join(temporary, 'smoke.mjs'))
  execFileSync(process.execPath, ['smoke.mjs'], { cwd: temporary, stdio: 'inherit' })
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
