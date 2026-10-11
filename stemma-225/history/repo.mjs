// The edition as it stood at each commit of the welte225.org repository, read with `git show`.
// Needs a clone with the full history (a shallow clone lacks the early commits; a blobless clone,
// git clone --filter=blob:none, is enough: git fetches each old edition.jsonld on first use).
//   W225_REPO   that clone (default: the welte225.org checkout around stemma-225/)
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { ROOT } from '../paths.mjs'

export const REPO = process.env.W225_REPO ? resolve(process.env.W225_REPO) : ROOT
const git = (...args) => execFileSync('git', ['-C', REPO, ...args], { maxBuffer: 1 << 30 }).toString()

if (git('rev-parse', '--is-shallow-repository').trim() === 'true')
  console.error(`warning: ${REPO} is a shallow clone, so its history of edition.jsonld is incomplete; set W225_REPO to a full clone`)

/** the commits that changed edition.jsonld, oldest first: { h: short hash, d: author date in `dateFormat`, s: subject } */
export const editionCommits = dateFormat => git('log', '--reverse', '--format=%h|%ad|%s', `--date=format:${dateFormat}`, '--', 'edition.jsonld')
  .trim().split('\n').map(l => { const [h, d, ...s] = l.split('|'); return { h, d, s: s.join('|') } })

/** edition.jsonld at commit `h`, parsed (raw JSON-LD, not imported: older formats differ) */
export const editionAt = h => JSON.parse(git('show', `${h}:edition.jsonld`))
