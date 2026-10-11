// Summarise the stemma in each historical edition.jsonld (raw JSON, no linked-rolls import,
// so that older formats can be read). Version ids are stable, so versions are labelled by
// today's siglum (from the current edition via linked-rolls) plus the siglum stored at the time.
import { readFileSync } from 'node:fs'
import * as LR from 'linked-rolls'
import { EDITION } from '../paths.mjs'
import { editionCommits, editionAt } from './repo.mjs'

const cur = JSON.parse(readFileSync(EDITION, 'utf8'))
const ed = LR.importJsonLd(cur)
const today = LR.siglaOf(ed)
const copySig = new Map(cur.copies.map(c => [c['@id'], c.siglum]))

const commits = editionCommits('%m-%d %H:%M')

const only = process.argv.slice(2)
const idOf = r => typeof r === 'string' ? r : r?.['@id'] ?? r?.id
const certaintyOf = r => r?.['@annotation']?.belief?.certainty ?? r?.annotation?.belief?.certainty ?? r?.belief?.certainty

const walkFeatures = (node, out) => {
    if (Array.isArray(node)) return node.forEach(n => walkFeatures(n, out))
    if (!node || typeof node !== 'object') return
    if (node['@id'] && node.horizontal) out.push(node['@id'])
    for (const v of Object.values(node)) walkFeatures(v, out)
}

let prevKey = ''
for (const { h, d, s } of commits) {
    if (only.length && !only.includes(h)) continue
    const doc = editionAt(h)
    const featureCopy = new Map()
    const copyLabel = c => copySig.get(c['@id'].replace(/^copy\//, '')) ?? c.siglum ?? c.name ?? c['@id'].slice(0, 8)
    for (const c of doc.copies ?? []) { const ids = []; walkFeatures(c, ids); ids.forEach(id => featureCopy.set(id, copyLabel(c))) }
    const vlabel = id => {
        const v = (doc.versions ?? []).find(v => v['@id'] === id)
        const t = today.get(id)
        return `${t ?? '∅'}${v?.siglum && v.siglum !== t ? '(' + v.siglum + ')' : ''}`
    }
    const lines = []
    for (const v of doc.versions ?? []) {
        const edits = v.edits ?? []
        const ins = edits.flatMap(e => e.insert ?? [])
        const del = edits.flatMap(e => e.delete ?? [])
        const unchecked = edits.filter(e => e.motivation === 'unchecked').length
        const bare = edits.filter(e => !e.editType && !e.motivation).length
        const carriers = {}
        for (const sym of ins) {
            const cs = [...new Set((sym.carriers ?? []).map(c => featureCopy.get(idOf(c)) ?? '?'))].sort().join('+')
            carriers[cs] = (carriers[cs] ?? 0) + 1
        }
        const top = Object.entries(carriers).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k}:${n}`).join(' ')
        const parents = [v.basedOn ?? []].flat().map(b => `${vlabel(idOf(b))}${certaintyOf(b) ? '[' + certaintyOf(b) + ']' : ''}${b.collationTolerance ? '@' + (+(b.collationTolerance.toleranceStart ?? b.collationTolerance.value?.toleranceStart ?? 0)).toFixed(2) : ''}`).join(',')
        lines.push(`  ${vlabel(v['@id']).padEnd(10)} <- ${(parents || 'ROOT').padEnd(26)} edits ${String(edits.length).padStart(4)} ins ${String(ins.length).padStart(4)} del ${String(del.length).padStart(3)} unchk ${String(unchecked).padStart(3)} bare ${String(bare).padStart(3)} | ${top}`)
    }
    const carries = (doc.copies ?? []).filter(c => c.carries?.length).map(c => `${copyLabel(c)}→${[c.carries].flat().map(r => vlabel(idOf(r)) + '[' + (certaintyOf(r) ?? '') + ']').join('/')}`)
    const copies = (doc.copies ?? []).map(copyLabel).join(',')
    const key = lines.join('\n') + carries.join()
    if (key === prevKey && !only.length) { console.log(`${h} ${d} ${s}  (stemma unchanged)`); continue }
    prevKey = key
    console.log(`\n${h} ${d} ${s}\n  copies: ${copies}\n  carries: ${carries.join('; ')}`)
    console.log(lines.join('\n'))
}
