import { readFileSync, writeFileSync } from 'node:fs'

const doc = JSON.parse(readFileSync('/Users/nielspfeffer/Projects/welte225.org/edition.jsonld', 'utf-8'))
const SHORT = {
  'd229954b-086c-44d6-a589-aaa324d31d88': 'S1', '88460599-2e0d-4759-851c-903a5a521997': 'S2',
  'a7ff95b7-f43a-4341-ba86-80fa4e84499c': 'W', '6e1ce072-7490-44b6-b8e8-eb1bbffc3cad': 'L',
  '9ae56c3e-b058-4972-9895-96946c6b93f8': 'G'
}
const features = new Map(doc.copies.flatMap(c => (c.features ?? []).map(f => [f['@id'], { copy: SHORT[c['@id']] ?? c['@id'], from: f.horizontal.from, to: f.horizontal.to, track: f.vertical.from, trackTo: f.vertical.to }])))
const byId = new Map(doc.versions.map(v => [v['@id'], v]))
const parentOf = v => v.basedOn?.[0] && byId.get(v.basedOn[0]['@id'])
const lineage = v => { const l = []; for (let x = v; x; x = parentOf(x)) l.unshift(x); return l }
const describe = (s, home) => {
  const cs = (s.carriers ?? []).map(c => features.get(c['@id'])).filter(Boolean)
  const mean = k => cs.length ? cs.reduce((a, c) => a + c[k], 0) / cs.length : null
  return { id: s['@id'], type: s['@type'], pitch: s.pitch, expressionType: s.expressionType, scope: s.scope, home,
    from: mean('from'), to: mean('to'), witnesses: [...new Set(cs.map(c => c.copy))].sort(),
    carriers: cs }
}
const out = { versions: [], snapshots: {} }
for (const v of doc.versions) {
  const parent = parentOf(v)
  out.versions.push({ siglum: v.siglum, parent: parent?.siglum ?? null, system: v.system?.['@id'],
    motivations: (v.motivations ?? []).map(m => ({ id: m['@id'], note: m.note })),
    edits: (v.edits ?? []).map(e => ({ id: e['@id'], motivation: e.motivation,
      insert: (e.insert ?? []).map(s => describe(s, v.siglum)), delete: e.delete ?? [] })) })
  const struck = new Set(); const kept = []
  lineage(v).forEach(x => (x.edits ?? []).forEach(e => { (e.delete ?? []).forEach(id => struck.add(id)); (e.insert ?? []).forEach(s => kept.push(describe(s, x.siglum))) }))
  out.snapshots[v.siglum] = kept.filter(s => !struck.has(s.id))
}
out.copies = doc.copies.map(c => ({ id: c['@id'], short: SHORT[c['@id']], keeper: c.keeper?.name, features: (c.features ?? []).length, shift: c.measurements?.shift, scale: c.measurements?.scale, ops: c.ops }))
writeFileSync(new URL('./versions.json', import.meta.url), JSON.stringify(out))
for (const [k, s] of Object.entries(out.snapshots)) {
  const notes = s.filter(x => x.type === 'note').length
  const types = {}; s.filter(x => x.type !== 'note').forEach(x => types[x.expressionType + ':' + x.scope] = (types[x.expressionType + ':' + x.scope] ?? 0) + 1)
  console.log(k, 'symbols', s.length, 'notes', notes, JSON.stringify(types))
}
console.log(out.versions.map(v => `${v.siglum}<-${v.parent} edits ${v.edits.length}`).join('\n'))
console.log(JSON.stringify(out.copies))
const spread = out.snapshots.C.filter(s => new Set(s.carriers.map(c => c.copy)).size > 1).map(s => Math.max(...s.carriers.map(c => c.from)) - Math.min(...s.carriers.map(c => c.from)))
spread.sort((a, b) => a - b)
console.log('C symbols with several copies:', spread.length, 'onset spread median', spread[spread.length >> 1]?.toFixed(2), 'p90', spread[Math.floor(spread.length * 0.9)]?.toFixed(2))
