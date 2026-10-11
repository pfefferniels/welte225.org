import { editionAt } from './repo.mjs'
const load = editionAt
const B1 = h => load(h).versions.find(v => v.siglum === 'B1')
const featIdx = doc => { const m = new Map(); for (const c of doc.copies) { const walk = n => { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; if (n['@id'] && n.horizontal) m.set(n['@id'], { c: c['@id'].replace('copy/','').slice(0,4), from: n.horizontal.from, to: n.horizontal.to }); Object.values(n).forEach(walk) }; walk(c) } return m }
for (const h of ['1ea0ad3', '39c403f', '04ea9dc']) {
  const doc = load(h); const fi = featIdx(doc); const b1 = doc.versions.find(v => v.siglum === 'B1')
  console.log(h, b1 ? '' : 'no B1')
  if (!b1) continue
  for (const e of b1.edits) for (const s of e.insert ?? []) console.log('  ', s.expressionType ?? s.pitch, s.scope ?? '', s['@id'].slice(0, 15), (s.carriers||[]).map(c => { const f = fi.get(c['@id']); return f ? `${f.c}@${f.from.toFixed(1)}` : '?' }).join(' '))
  console.log('   B1 basedOn note:', JSON.stringify(b1.basedOn).slice(0, 900))
}
// where did the B1 symbols go at 04ea9dc and 1a7b95d?
const ids = B1('1ea0ad3').edits.flatMap(e => (e.insert ?? []).map(s => s['@id']))
for (const h of ['04ea9dc', '1a7b95d', '409fd57']) {
  const doc = load(h)
  for (const id of ids) {
    const home = doc.versions.filter(v => (v.edits ?? []).some(e => (e.insert ?? []).some(s => s['@id'] === id))).map(v => v.siglum ?? v['@id'].slice(0, 8))
    const del = doc.versions.filter(v => (v.edits ?? []).some(e => (e.delete ?? []).includes(id))).map(v => v.siglum ?? v['@id'].slice(0, 8))
    console.log(h, id.slice(0, 15), 'inserted in', home.join(','), 'deleted in', del.join(','))
  }
}
