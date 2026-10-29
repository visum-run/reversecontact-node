import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { version } from '../package.json'

const script = fileURLToPath(new URL('../scripts/release-notes.mjs', import.meta.url))

it('extracts release notes for the package version from the current changelog', () => {
  const notes = execFileSync(process.execPath, [script, version], { encoding: 'utf8' })
  expect(notes.trim()).not.toBe('')
  expect(notes).not.toContain('## ')
})

it.each(['1.2.3', '1.2.3-rc.1'])('extracts only %s, preserving nested headings', target => {
  const temporary = mkdtempSync(fileURLToPath(new URL('../.smoke-notes-', import.meta.url)))
  try {
    mkdirSync(join(temporary, 'scripts'))
    const fixtureScript = join(temporary, 'scripts', 'release-notes.mjs')
    copyFileSync(script, fixtureScript)
    writeFileSync(
      join(temporary, 'CHANGELOG.md'),
      `# Changelog\n\n## 2.0.0 (unreleased)\n\n- Future.\n\n## ${target} (2026-10-29)\n\n### Fixed\n\n- This release.\n\n## 1.0.0\n\n- Earlier.\n`
    )
    const notes = execFileSync(process.execPath, [fixtureScript, target], { encoding: 'utf8' })
    expect(notes).toBe('### Fixed\n\n- This release.\n')
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

it('fails without emitting release notes when the version is missing', () => {
  const result = spawnSync(process.execPath, [script, '999.999.999'], { encoding: 'utf8' })
  expect(result.status).toBe(1)
  expect(result.stdout).toBe('')
  expect(result.stderr).toContain('CHANGELOG.md has no section for 999.999.999')
})
