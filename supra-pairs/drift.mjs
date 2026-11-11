// How the second copy of a roll lies against the first along the paper,
// once the edition has aligned them by one shift and one scale: every
// note of the second copy against the nearest note of the same pitch on
// the first, the offsets gathered by stretch of roll. A straight line
// through two papers leaves offsets scattered about zero; where the
// medians wander from stretch to stretch, the papers do not relate by a
// line, and the collation's window then loses what lies beyond it.
//
//   node drift.mjs --out out [--only 662,1473] [--bins 12]
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) =>
    arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []))
const libraryAt = resolve(args['linked-rolls'] ?? join(here, '../../linked-rolls'))
const out = resolve(args.out ?? join(here, 'out'))
const bins = +(args.bins ?? 12)
const reach = +(args.reach ?? 40)
const lib = await import(pathToFileURL(join(libraryAt, 'lib/index.js')).href)

const median = values => values.length === 0 ? NaN : [...values].sort((a, b) => a - b)[values.length >> 1]
const onsetsOf = copy => lib.featuresOf(copy)
    .flatMap(feature => feature.type !== 'HoleChain' ? [] : lib.barOf(copy).meaningsOf(feature.vertical)
        .filter(meaning => meaning.type === 'note').map(meaning => ({ pitch: meaning.pitch, at: feature.horizontal.from })))

console.log(['roll', 'scale', 'notes', 'within', 'spread of medians (mm)', 'medians by stretch of roll (mm)'].join('\t'))
for (const line of readFileSync(join(out, 'results.jsonl'), 'utf8').trim().split('\n')) {
    const record = JSON.parse(line)
    if (args.only && !args.only.split(',').includes(String(record.number))) continue
    const edition = lib.importJsonLd(JSON.parse(readFileSync(join(out, `wm${record.number}`, 'edition.jsonld'), 'utf8')))
    const [first, second] = edition.copies
    if (!second?.measurements.alignment) { console.log([record.number, 'not aligned'].join('\t')); continue }
    const byPitch = Map.groupBy(onsetsOf(first), onset => onset.pitch)
    const offsets = onsetsOf(second).flatMap(onset => {
        const nearest = (byPitch.get(onset.pitch) ?? []).reduce((best, other) =>
            Math.abs(other.at - onset.at) < Math.abs(best - onset.at) ? other.at : best, Infinity)
        return Math.abs(nearest - onset.at) <= reach ? [{ at: onset.at, by: onset.at - nearest }] : []
    })
    const from = Math.min(...offsets.map(o => o.at)), to = Math.max(...offsets.map(o => o.at))
    const medians = Array.from({ length: bins }, (_, i) =>
        median(offsets.filter(o => Math.floor((o.at - from) / (to - from + 1e-9) * bins) === i).map(o => o.by)))
    const known = medians.filter(Number.isFinite)
    console.log([record.number, second.measurements.alignment.scale.toFixed(5), onsetsOf(second).length, offsets.length,
        (Math.max(...known) - Math.min(...known)).toFixed(1), medians.map(m => m.toFixed(1)).join(' ')].join('\t'))
}
