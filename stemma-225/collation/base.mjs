// Shared loading: readings per copy (as createVersion would make them), and the edition's own partition.
import { readFileSync } from 'node:fs'
import * as LR from 'linked-rolls'
import { EDITION } from '../paths.mjs'
export { LR }
export const ed = LR.importJsonLd(JSON.parse(readFileSync(EDITION,'utf8')))
export const sig = LR.siglaOf(ed)
export const COPIES = ['St1','St2','Wi1','Ch1','Bo1','Ne1']
export const copyBySig = Object.fromEntries(ed.copies.map(c => [c.siglum, c]))
export const featureCopy = new Map()
export const featureById = new Map()
for (const c of ed.copies) for (const f of LR.featuresOf(c)) { featureCopy.set(f.id, c.siglum); featureById.set(f.id, f) }
export const keyOfSymbol = s => s.type === 'text' ? 'text' : LR.keyOf(s)
export const groupOfKey = k => k.split(' ')[0]   // note | expression | text

// Readings: one per (feature, meaning), exactly what asSymbols(featuresOf(copy), barOf(copy)) yields.
// A blind rule for what is text, from the copy alone: the leader before 1000 mm on the axis (tempo test block),
// the roll's end as the bar finds it (rewind, and Bo1's scanner staircase), and the control functions are not.
// Set ALL_READINGS=1 to keep everything asSymbols yields.
export const roll = {}
export const allReadings = []
export const readings = []
for (const s of COPIES) {
  const c = copyBySig[s]
  const bar = LR.barOf(c)
  const end = bar.endsAt(LR.featuresOf(c).filter(f => f.type === 'HoleChain'))
  roll[s] = { end: end?.at }
  for (const sym of LR.asSymbols(LR.featuresOf(c), bar)) {
    const fid = LR.idOf(sym.carriers[0]); const f = featureById.get(fid)
    const key = keyOfSymbol(sym)
    const r = { rid: fid + '|' + key, fid, copy: s, key, kind: sym.type, from: f.horizontal.from, to: f.horizontal.to,
      system: bar.id, expressionType: sym.expressionType, scope: sym.scope, pitch: sym.pitch, sym }
    allReadings.push(r)
    const text = r.from >= 1000 && (end === undefined || r.from < end.at) && !/Rewind|Motor|ElectricCutOff/.test(key)
    if (text || process.env.ALL_READINGS) readings.push(r)
  }
}
export const readingById = new Map(allReadings.map(r => [r.rid, r]))

// The edition: every symbol any version inserts, as a set of reading ids (carrier feature + the symbol's key).
export const edSymbols = []
for (const v of ed.versions) for (const e of v.edits ?? []) for (const s of e.insert ?? []) {
  const key = keyOfSymbol(s)
  const rids = s.carriers.map(c => LR.idOf(c) + '|' + key)
  edSymbols.push({ id: s.id, version: sig.get(v.id), key, kind: s.type, rids, edit: e, sym: s,
    copies: [...new Set(s.carriers.map(c => featureCopy.get(LR.idOf(c))))].sort() })
}
export const edSymbolOfRid = new Map()
for (const s of edSymbols) for (const r of s.rids) {
  if (edSymbolOfRid.has(r)) console.warn('reading in two edition symbols', r)
  edSymbolOfRid.set(r, s)
}
export const pattern = copies => COPIES.filter(c => copies.includes(c)).join('+')
