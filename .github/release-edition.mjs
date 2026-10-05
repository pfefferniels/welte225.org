// Settles the version under which the edition, as it stands, is released.
//
// A version not yet tagged is released as it is. Where the version stated is
// tagged already but the file has changed since, the last number is raised
// above every tag of that major and minor version (1.0 becomes 1.0.1, 1.0.1
// becomes 1.0.2) and the publication date set to the day, in place, so that
// nothing else in the file moves. Where nothing changed, nothing is released.
//
// Writes `version` and `raised` to $GITHUB_OUTPUT.

import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

const file = 'edition.jsonld'

const output = (values) => {
    const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join('')
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines)
    process.stdout.write(lines)
}

const text = readFileSync(file, 'utf-8')
const edition = JSON.parse(text)
const stated = edition.version?.trim()

if (!stated) {
    console.log('The edition states no version')
    output({ version: '', raised: false })
    process.exit(0)
}

const tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf-8' })
    .split('\n')
    .filter(Boolean)

if (!tags.includes(`v${stated}`)) {
    output({ version: stated, raised: false })
    process.exit(0)
}

/** Whether the file differs from the one the tag holds. */
const changedSince = (tag) => {
    try {
        execFileSync('git', ['diff', '--quiet', tag, '--', file])
        return false
    }
    catch {
        return true
    }
}

if (!changedSince(`v${stated}`)) {
    console.log(`Nothing changed since v${stated}`)
    output({ version: stated, raised: false })
    process.exit(0)
}

// Roll Desk writes the file as JSON.stringify(…, null, 4) does; only then can
// the two fields be rewritten without reformatting the rest.
const ending = text.endsWith('\n') ? '\n' : ''
if (JSON.stringify(edition, null, 4) + ending !== text) {
    console.error(`${file} is not formatted as Roll Desk writes it; raise the version by hand`)
    process.exit(1)
}

const [major, minor = '0'] = stated.split('.')
const patches = tags
    .map(tag => tag.slice(1).split('.'))
    .filter(([a, b = '0']) => a === major && b === minor)
    .map(([, , patch = '0']) => Number(patch))
    .filter(Number.isInteger)
const version = `${major}.${minor}.${Math.max(0, ...patches) + 1}`

edition.version = version
edition.creation.publicationDate = new Date().toISOString().slice(0, 10)
writeFileSync(file, JSON.stringify(edition, null, 4) + ending)

console.log(`Raised v${stated} to ${version}`)
output({ version, raised: true })
