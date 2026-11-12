// What the proposed edits of each edition are: for every version that
// derives from another, its edits by shape (`shapeOf`, or "unshaped" for
// a reading simply put in or taken out), by what they touch (notes or
// expression) and by whether they insert, delete or replace.
//
//   node edits.mjs [--out out] [--linked-rolls ../../linked-rolls] > edits.tsv
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) =>
    arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []))
const lib = await import(pathToFileURL(join(resolve(args['linked-rolls'] ?? join(here, '../../linked-rolls')), 'lib/index.js')).href)
const out = resolve(here, args.out ?? 'out')

console.log(['roll', 'shape', 'touches', 'does', 'edits'].join('\t'))
for (const directory of readdirSync(out).filter(name => existsSync(join(out, name, 'edition.jsonld'))).sort((a, b) => a.slice(2) - b.slice(2))) {
    const edition = lib.importJsonLd(JSON.parse(readFileSync(join(out, directory, 'edition.jsonld'), 'utf8')))
    // a deleted reading is named by its id; what it was stands where it was inserted
    const inserted = new Map(edition.versions.flatMap(version => version.edits.flatMap(edit => edit.insert ?? [])).map(symbol => [symbol.id, symbol]))
    const tally = new Map()
    for (const version of edition.versions.filter(version => lib.derivationsOf(version).length > 0)) {
        for (const edit of version.edits) {
            const kinds = new Set([...(edit.insert ?? []), ...(edit.delete ?? []).map(id => inserted.get(id) ?? { type: 'unknown' })].map(symbol => symbol.type))
            const key = [
                lib.shapeOf(edition, version.id, edit) ?? 'unshaped',
                kinds.size === 1 ? [...kinds][0] : 'mixed',
                edit.insert?.length ? edit.delete?.length ? 'replace' : 'insert' : 'delete'
            ].join('\t')
            tally.set(key, (tally.get(key) ?? 0) + 1)
        }
    }
    for (const [key, edits] of [...tally].sort()) console.log([directory.slice(2), key, edits].join('\t'))
}
