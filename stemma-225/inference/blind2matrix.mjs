// Convert the blind collation (../collation/blind-matrix.json) into the matrix.json schema used by matrix.py.
// Each blind cluster becomes a "symbol"; carrier places come from the copies' features. For the final comparison only,
// each cluster is mapped to the edition symbol sharing most feature ids (field `edSymbol`), stored separately.
import { readFileSync, writeFileSync } from 'node:fs'
import * as LR from 'linked-rolls'
import { EDITION } from '../paths.mjs'
const DIR = new URL('../', import.meta.url)   // stemma-225/
const ed = LR.importJsonLd(JSON.parse(readFileSync(EDITION, 'utf8')))
const blind = JSON.parse(readFileSync(new URL('collation/blind-matrix.json', DIR), 'utf8'))
const base = JSON.parse(readFileSync(new URL('inference/matrix.json', DIR), 'utf8'))
const feat = new Map(), featCopy = new Map()
for (const c of ed.copies) for (const f of LR.featuresOf(c)) { feat.set(f.id, f); featCopy.set(f.id, c.siglum) }
// edition symbol by carrier feature
const symOfFeature = new Map()
for (const v of ed.versions) for (const s of LR.insertedBy(v)) for (const r of s.carriers) {
  const fid = LR.idOf(r); (symOfFeature.get(fid) ?? symOfFeature.set(fid, []).get(fid)).push(s.id)
}
const symbols = [], mapping = {}
const median = a => { const b = [...a].sort((x, y) => x - y); const n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2 }
for (const c of blind.clusters) {
  const parts = c.key.split(' ')
  const s = { id: c.id, type: c.kind, copies: [...c.copies].sort(), nCarriers: c.features.length }
  if (c.kind === 'note') s.pitch = Number(parts[1])
  else { s.scope = parts[1]; s.expressionType = parts[2] }
  const fs = c.features.map(id => feat.get(id))
  s.from = median(fs.map(f => f.horizontal.from)); s.to = median(fs.map(f => f.horizontal.to))
  s.carrierPlaces = {}
  for (const f of fs) (s.carrierPlaces[featCopy.get(f.id)] ??= []).push({ from: f.horizontal.from, to: f.horizontal.to, track: f.vertical?.from, type: f.type })
  if (c.greenRecodedBy) s.bo1link = c.greenRecodedBy
  symbols.push(s)
  const cnt = {}
  for (const fid of c.features) for (const sid of symOfFeature.get(fid) ?? []) cnt[sid] = (cnt[sid] ?? 0) + 1
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]
  mapping[c.id] = { edSymbol: best?.[0] ?? null, shared: best?.[1] ?? 0, of: c.features.length, status: c.edition.status }
}
writeFileSync(new URL('inference/matrix_blind.json', DIR), JSON.stringify({ copies: base.copies, coverage: base.coverage, symbols }))
writeFileSync(new URL('inference/blind_mapping.json', DIR), JSON.stringify(mapping))
const st = {}
for (const m of Object.values(mapping)) st[m.edSymbol ? (m.shared === m.of ? 'all features in one ed symbol' : 'partial') : 'none'] = (st[m.edSymbol ? (m.shared === m.of ? 'all features in one ed symbol' : 'partial') : 'none'] ?? 0) + 1
console.log(symbols.length, st, 'linked to Bo1', symbols.filter(s => s.bo1link).length)
