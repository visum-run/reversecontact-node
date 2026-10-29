import { readFileSync } from 'node:fs'

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(version)) {
  console.error('Usage: node scripts/release-notes.mjs <version>')
  process.exit(1)
}
const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split(/\r?\n/)
const start = lines.findIndex(
  line => line === `## ${version}` || line.startsWith(`## ${version} (`)
)
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}`)
  process.exit(1)
}
const next = lines.findIndex((line, index) => index > start && line.startsWith('## '))
const notes = lines
  .slice(start + 1, next === -1 ? undefined : next)
  .join('\n')
  .trim()
if (!notes) {
  console.error(`CHANGELOG.md has an empty section for ${version}`)
  process.exit(1)
}
console.log(notes)
