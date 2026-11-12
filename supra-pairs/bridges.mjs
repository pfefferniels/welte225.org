// How many chains the two copies of a roll differ by, track for track,
// with the chains as the parser made them and with the holes chained
// over a fixed length of paper instead (`bridge` of readFromStanfordAton).
//
//   node bridges.mjs [--rolls rolls.json] [--linked-rolls ../../linked-rolls] > bridges.tsv
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) =>
    arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []))
const lib = await import(pathToFileURL(join(resolve(args['linked-rolls'] ?? join(here, '../../linked-rolls')), 'lib/index.js')).href)
const rolls = JSON.parse(readFileSync(resolve(here, args.rolls ?? 'rolls.json'), 'utf8'))

// millimetres of paper a chain may hold; nothing stands for the parser's own chains
const bridges = [undefined, 1.2, 1.5, 1.7, 1.85, 2.0, 2.2, 2.5]
const analysis = file => execFileSync('bzip2', ['-dc', resolve(here, file)], { maxBuffer: 1 << 30 }).toString('utf8')
const chainsByTrack = (text, bridge) =>
    lib.featuresOf(lib.readFromStanfordAton(text, bridge === undefined ? {} : { bridge }))
        .reduce((counts, chain) => counts.set(chain.vertical.from, (counts.get(chain.vertical.from) ?? 0) + 1), new Map())

console.log(['roll', ...bridges.map(bridge => bridge === undefined ? 'parser' : `${bridge} mm`)].join('\t'))
const totals = bridges.map(() => 0)
for (const roll of rolls) {
    const texts = roll.copies.slice(0, 2).map(copy => analysis(copy.file))
    const apart = bridges.map(bridge => {
        const [one, other] = texts.map(text => chainsByTrack(text, bridge))
        return [...new Set([...one.keys(), ...other.keys()])]
            .reduce((sum, t) => sum + Math.abs((one.get(t) ?? 0) - (other.get(t) ?? 0)), 0)
    })
    // WM 371's second analysis holds the middle of the roll only
    if (roll.number !== 371) apart.forEach((chains, i) => { totals[i] += chains })
    console.log([roll.number, ...apart].join('\t'))
}
console.log(['all but 371', ...totals].join('\t'))
