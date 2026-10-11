import { editionCommits, editionAt } from './repo.mjs'
const commits = editionCommits('%m-%d').map(({ h, d, s }) => [h, d, s])
const strip = id => id.replace(/^(symbol_|copy\/|edit\/|version\/)/, '')
const idsOf = doc => {
  const V = new Set(), S = new Set(), E = new Set()
  for (const v of doc.versions) { V.add(strip(v['@id'])); for (const e of [v.edits ?? []].flat()) { E.add(strip(e['@id'])); for (const s of e.insert ?? []) S.add(strip(s['@id'])) } }
  return { V, S, E }
}
let prev, everS = new Set(), everE = new Set(), everV = new Set()
const rows = []
for (const [h, d, s] of commits) {
  const cur = idsOf(editionAt(h))
  if (prev) {
    const lost = k => [...prev[k]].filter(x => !cur[k].has(x)).length
    const gained = k => [...cur[k]].filter(x => !prev[k].has(x)).length
    const r = { h, d, s: s.slice(0, 60), V: `-${lost('V')}+${gained('V')}`, S: `-${lost('S')}+${gained('S')}`, E: `-${lost('E')}+${gained('E')}` }
    if (r.V + r.S + r.E !== '-0+0-0+0-0+0') rows.push(r)
  }
  cur.V.forEach(x => everV.add(x)); cur.S.forEach(x => everS.add(x)); cur.E.forEach(x => everE.add(x))
  prev = cur
}
for (const r of rows) console.log(r.h, r.d, `versions ${r.V.padEnd(6)} symbols ${r.S.padEnd(10)} edits ${r.E.padEnd(10)}`, r.s)
const last = prev
console.log('ever minted: versions', everV.size, 'symbols', everS.size, 'edits', everE.size)
console.log('alive at end: versions', last.V.size, 'symbols', last.S.size, 'edits', last.E.size)
console.log('dead IRIs: versions', [...everV].filter(x => !last.V.has(x)).length, 'symbols', [...everS].filter(x => !last.S.has(x)).length, 'edits', [...everE].filter(x => !last.E.has(x)).length)
