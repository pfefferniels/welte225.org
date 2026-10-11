// The blind matrix: scatter windows, single linkage, both ends; green held commands linked to red latched pairs
// by substitutionsBetween at 5 mm through any copy. Writes blind-matrix.json and prints the summary tables.
import { writeFileSync } from 'node:fs'
import { LR, readings, readingById, edSymbols, edSymbolOfRid, ed, sig, COPIES, pattern } from './base.mjs'
import { blindCollation } from './blind.mjs'
import { compare } from './compare.mjs'
const { clusters, windows } = blindCollation({ linkage: 'single' })
const r = compare(clusters)
const clusterOf = r.clusterOf
// green links
const symOf = x => ({ ...x.sym, id: x.rid })
const locate = s => { const x = readingById.get(s.id); return { unit: 'mm', from: x.from, to: x.to } }
const green = readings.filter(x => x.copy === 'Bo1' && x.kind === 'expression').map(symOf)
const links = new Map() // red cluster -> set of green cluster ids
const greenRuns = new Map()
for (const c of COPIES.filter(c => c !== 'Bo1')) {
  const red = readings.filter(x => x.copy === c && x.kind === 'expression').map(symOf)
  for (const s of LR.substitutionsBetween(green, red, locate, { toleranceStart: 5, toleranceEnd: 5 })) {
    const g = s.by.map(x => clusterOf.get(x.id))
    for (const rr of s.replaced) { const k = clusterOf.get(rr.id); const set = links.get(k) ?? new Set(); g.forEach(x => set.add(x)); links.set(k, set) }
    const gk = g.join(','); greenRuns.set(gk, [...new Set([...(greenRuns.get(gk) ?? []), ...s.replaced.map(x => clusterOf.get(x.id))])])
  }
}
const out = clusters.map((c, i) => {
  const eds = [...new Set(c.rids.map(x => edSymbolOfRid.get(x)).filter(Boolean))]
  const st = eds.length === 0 ? 'not in edition' : eds.length > 1 ? 'merges edition symbols' : eds[0].rids.length !== c.rids.length ? 'part of a split edition symbol' : 'exact'
  return { id: `b${i}`, kind: c.kind, key: c.key, from: +c.from.toFixed(2), to: +c.to.toFixed(2), copies: c.copies, pattern: c.pattern,
    features: c.features, readings: c.rids,
    ...(links.has(i) && { greenRecodedBy: [...links.get(i)].map(g => `b${g}`), patternWithGreen: pattern([...c.copies, 'Bo1']) }),
    edition: { symbols: eds.map(s => s.id), versions: eds.map(s => s.version), status: st } }
})
writeFileSync(new URL('blind-matrix.json', import.meta.url), JSON.stringify({
  method: 'Readings = asSymbols(featuresOf(copy), barOf(copy)) for St1,St2,Wi1,Ch1,Bo1,Ne1 on the stored (reproducible) alignment; leader <1000 mm, roll end and Rewind/Motor/ElectricCutOff dropped. Same key (keyOf), different copies; per copy pair and group a window k(n)*MAD-sigma about the median displacement of mutual nearest onsets within 8 mm (as scatter.ts); edges admitted at both ends; Kruskal single linkage nearest first, ties by reading id, never joining two readings of one copy. Green held runs linked to red latched pairs with substitutionsBetween at 5 mm through each red/Licensee copy.',
  windows: Object.fromEntries([...windows].map(([k, w]) => [k, { n: w.n, offsetStart: +w.offsetStart.toFixed(3), toleranceStart: +w.toleranceStart.toFixed(3), offsetEnd: +w.offsetEnd.toFixed(3), toleranceEnd: +w.toleranceEnd.toFixed(3) }])),
  clusters: out }, null, 1))
console.log('clusters', out.length, 'written to blind-matrix.json')
console.log('edition symbols reproduced exactly', r.exact, '/', r.n)
console.table(r.tallyKind)
console.table(r.tallyVersion)
console.table(r.perCopy)
console.log('pairs only in edition by copy pair', r.pairs.onlyEdByCopyPair)
console.log('pairs only in blind by copy pair', r.pairs.onlyBlByCopyPair)
// patterns with green: for red expression clusters, and the edition's analog (red symbols G1 recodes two-sidedly)
const g1 = ed.versions.find(v => sig.get(v.id) === 'G1')
const recodedEd = new Set(g1.edits.filter(e => e.editType === 'recoding' && e.insert?.length && e.delete?.length).flatMap(e => e.delete))
let agreeG = 0, nG = 0, onlyBl = 0, onlyEd = 0
for (const [i, c] of out.entries()) {
  if (c.kind !== 'expression' || c.copies.includes('Bo1')) continue
  const eds = c.edition.symbols; if (eds.length !== 1 || c.edition.status !== 'exact') continue
  nG++; const b = !!c.greenRecodedBy, e = recodedEd.has(eds[0])
  if (b === e) agreeG++; else if (b) onlyBl++; else onlyEd++
}
console.log(`Bo1 presence on exactly reproduced red expression symbols: agree ${agreeG}/${nG}; blind links where edition has none ${onlyBl}; edition recodes but blind finds no link ${onlyEd}`)
const spec = {}; for (const c of out) { if (c.kind !== 'expression' || c.copies.includes('Bo1')) continue; const k = c.patternWithGreen ?? c.pattern; spec[k] = (spec[k] ?? 0) + 1 }
console.log('expression patterns with green links', Object.entries(spec).sort((a, b) => b[1] - a[1]).slice(0, 14))
