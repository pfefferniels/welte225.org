import { editionAt } from './repo.mjs'
const sig = { '0e5f443d':'r1','19fd4209':'R2','bab25aef':'r3','c9050e75':'R4','755d411a':'R1.1','e07c4be8':'L2','7828b5bd':'G1','8a074fdb':'r5','2767844e':'L1' }
const cs = { d229:'St1', '8846':'St2', a7ff:'Wi1', '6e1c':'Ch1', '9ae5':'Bo1', '6370':'Ne1' }
for (const h of process.argv.slice(2)) {
  const doc = editionAt(h)
  const fi = new Map(); for (const c of doc.copies) { const walk = n => { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; if (n['@id'] && n.horizontal) fi.set(n['@id'], { c: cs[c['@id'].replace('copy/','').slice(0,4)] ?? '?', from: n.horizontal.from }); Object.values(n).forEach(walk) }; walk(c) }
  const sym = new Map(); const home = new Map()
  for (const v of doc.versions) for (const e of v.edits ?? []) for (const s of e.insert ?? []) { sym.set(s['@id'], s); home.set(s['@id'], sig[v['@id'].slice(0,8)]) }
  const desc = id => { const s = sym.get(id); if (!s) return id.slice(0,12); const cars = (s.carriers??[]).map(c => fi.get(c['@id'])).filter(Boolean); return `${home.get(id)}:${s.expressionType ?? s.pitch}${s.scope ? '/' + s.scope : ''}@${cars.map(f => f.c + f.from.toFixed(1)).join(',')}` }
  for (const target of ['bab25aef']) {
    const v = doc.versions.find(v => v['@id'].startsWith(target))
    console.log(`== ${h} ${sig[target]}`)
    for (const e of v.edits) console.log('  ', e.editType ?? '-', e.motivation ?? '-', 'INS', (e.insert??[]).map(s => desc(s['@id'])).join(' | '), 'DEL', (e.delete??[]).map(desc).join(' | '))
  }
}
