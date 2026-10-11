// Extract the copy x reading presence matrix from the edition (symbols + carriers only).
// Writes matrix.json (blind input) and truth.json (editor's versions/edits, for comparison ONLY).
import { readFileSync, writeFileSync } from 'node:fs'
import * as LR from 'linked-rolls'
import { EDITION } from '../paths.mjs'
const ed = LR.importJsonLd(JSON.parse(readFileSync(EDITION, 'utf8')))
const sig = LR.siglaOf(ed)
const OUT = new URL('./', import.meta.url)   // this directory

const COPIES = ['St1', 'St2', 'Wi1', 'Ch1', 'Bo1', 'Ne1']
const copyById = new Map(ed.copies.map(c => [c.id, c]))

// feature id -> copy siglum (precompute)
const featCopy = new Map()
const featInfo = new Map()
for (const c of ed.copies) for (const f of LR.featuresOf(c)) {
  featCopy.set(f.id, c.siglum)
  featInfo.set(f.id, { from: f.horizontal?.from, to: f.horizontal?.to, track: f.vertical?.from, type: f.type, cond: f.condition ? (f.condition.conditionType ?? f.condition.type ?? 'x') : undefined })
}

// coverage & tears
const coverage = {}
for (const c of ed.copies) {
  if (!COPIES.includes(c.siglum)) continue
  const fs = LR.featuresOf(c).filter(f => f.horizontal)
  const holes = fs.filter(f => f.type === 'HoleChain')
  const froms = holes.map(f => f.horizontal.from), tos = holes.map(f => f.horizontal.to)
  coverage[c.siglum] = {
    system: c.production?.system?.id?.split('/').pop(),
    first: Math.min(...froms), last: Math.max(...tos), nHoles: holes.length, nFeatures: fs.length,
    tears: LR.tearsOf(c).map(t => ({ from: t.horizontal.from, to: t.horizontal.to, edge: t.edge, depth: t.depth?.value ?? t.depth })),
  }
}

// all symbols (unique) from all edits
const symbols = new Map()
const insertedIn = new Map(), deletedIn = new Map()
for (const v of ed.versions) {
  for (const s of LR.insertedBy(v)) { symbols.set(s.id, s); insertedIn.set(s.id, sig.get(v.id)) }
  for (const id of LR.deletedBy(v)) { (deletedIn.get(id) ?? deletedIn.set(id, []).get(id)).push(sig.get(v.id)) }
}
// also symbols carried but not in edits? (shouldn't exist)
const rows = []
for (const s of symbols.values()) {
  const carriers = (s.carriers ?? []).map(r => LR.idOf(r))
  const byCopy = {}
  for (const fid of carriers) {
    const cs = featCopy.get(fid) ?? LR.copyOfFeature(ed, fid)?.siglum
    if (!cs) continue
    ;(byCopy[cs] ??= []).push(fid)
  }
  const place = LR.placeOf(ed, s)
  rows.push({
    id: s.id, type: s.type,
    pitch: s.pitch, expressionType: s.expressionType, scope: s.scope, text: s.text,
    from: place?.from, to: place?.to,
    copies: Object.keys(byCopy).sort(),
    nCarriers: carriers.length,
    carrierPlaces: Object.fromEntries(Object.entries(byCopy).map(([c, fids]) => [c, fids.map(f => featInfo.get(f))])),
  })
}
writeFileSync(new URL('matrix.json', OUT), JSON.stringify({ copies: COPIES, coverage, symbols: rows }, null, 0))

// truth (for comparison only)
const truth = {
  versions: ed.versions.map(v => ({
    siglum: sig.get(v.id), id: v.id, system: v.system?.id?.split('/').pop(),
    basedOn: (v.basedOn ?? []).map(d => ({ siglum: sig.get(LR.idOf(d)), certainty: d['@annotation']?.belief?.certainty })),
    ins: LR.insertedBy(v).map(s => s.id), del: [...LR.deletedBy(v)],
    edits: (v.edits ?? []).map(e => ({ type: e.editType, ins: (e.insert ?? []).map(s => s.id), del: (e.delete ?? []).map(r => typeof r === "string" ? r : LR.idOf(r)), motivation: typeof e.motivation === "string" ? e.motivation : (e.motivation ? LR.idOf(e.motivation) : undefined) })),
  })),
  insertedIn: Object.fromEntries(insertedIn), deletedIn: Object.fromEntries(deletedIn),
}
writeFileSync(new URL('truth.json', OUT), JSON.stringify(truth))
console.log('symbols', rows.length, 'coverage', JSON.stringify(coverage, null, 1))
const byType = {}
for (const r of rows) byType[r.type] = (byType[r.type] ?? 0) + 1
console.log(byType)
