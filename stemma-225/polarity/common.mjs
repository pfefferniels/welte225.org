import { readFileSync } from 'node:fs'
import * as LR from 'linked-rolls'
import { EDITION } from '../paths.mjs'
export { LR }
export const ed = LR.importJsonLd(JSON.parse(readFileSync(EDITION,'utf8')))
export const sig = LR.siglaOf(ed)
export const V = Object.fromEntries(ed.versions.map(v => [sig.get(v.id), v]))
export const copyBySig = Object.fromEntries(ed.copies.map(c => [c.siglum, c]))
// feature id -> copy siglum
export const featCopy = new Map()
for (const c of ed.copies) for (const f of LR.featuresOf(c)) featCopy.set(f.id, c.siglum)
export const carrierCopies = s => [...new Set((s.carriers ?? []).map(r => featCopy.get(LR.idOf(r))).filter(Boolean))].sort()
// all symbols by id
export const symById = new Map()
for (const v of ed.versions) for (const s of LR.insertedBy(v)) symById.set(s.id, s)
export const insertedIn = new Map() // symbol id -> version siglum
for (const v of ed.versions) for (const s of LR.insertedBy(v)) insertedIn.set(s.id, sig.get(v.id))
export const deletedIn = new Map() // symbol id -> [version sigla]
for (const v of ed.versions) for (const id of LR.deletedBy(v)) deletedIn.set(id, [...(deletedIn.get(id) ?? []), sig.get(v.id)])
const placeCache = new Map()
export const place = s => { if (!placeCache.has(s.id)) placeCache.set(s.id, LR.placeOf(ed, s)); return placeCache.get(s.id) }
export const parentOf = sg => { const d = (V[sg].basedOn ?? [])[0]; return d ? sig.get(LR.idOf(d)) : undefined }
export const editOfSymbol = new Map() // symbol id -> {version, edit, role}
for (const v of ed.versions) for (const e of LR.editsOf(v)) {
  for (const s of e.insert ?? []) editOfSymbol.set(s.id + '|ins', { v: sig.get(v.id), e })
  for (const id of e.delete ?? []) editOfSymbol.set(id + '|del|' + sig.get(v.id), { v: sig.get(v.id), e })
}

// ---- semantics of T-100 / Licensee commands
// Latched set/cancel pairs. key = function (+ side where sided)
const OPS = {
  MezzoforteOn: ['mezzoforte', 'on', true], MezzoforteOff: ['mezzoforte', 'off', true],
  SlowCrescendoOn: ['crescendo', 'on', true], SlowCrescendoOff: ['crescendo', 'off', true],
  ForzandoOn: ['sforzando', 'on', true], ForzandoOff: ['sforzando', 'off', true],
  SustainPedalOn: ['sustainPedal', 'on', false], SustainPedalOff: ['sustainPedal', 'off', false],
  SoftPedalOn: ['softPedal', 'on', false], SoftPedalOff: ['softPedal', 'off', false],
  MotorOn: ['motor', 'on', true], MotorOff: ['motor', 'off', true],
}
export const opOf = s => s.type === 'expression' ? OPS[s.expressionType] : undefined
export const keyOf = s => { const o = opOf(s); return o ? (o[2] ? `${o[0]}:${s.scope}` : o[0]) : undefined }
export const short = s => s.type === 'note' ? `n${s.pitch}` : `${s.expressionType.replace('SlowCrescendo','Cr').replace('Forzando','Fz').replace('Mezzoforte','MF').replace('SustainPedal','Ped').replace('SoftPedal','Soft')}${opOf(s)?.[2] ? (s.scope==='bass'?'.b':'.t') : ''}`
export const fmt = s => { const p = place(s); return `${short(s)}@${p ? p.from.toFixed(1) : '?'}` }

/**
 * Latch redundancy of a text: for each latched function, walk its commands
 * in order of onset; an On while the function stands, or an Off while it is
 * cancelled, has no effect on the latch. Ties at one place: cancel first
 * (as the emulator's `latched`: cancel wins a tie) – parameter.
 * Returns Map id -> {kind:'on-on'|'off-off', prev: symbol|null}
 */
export function latchRedundancies(symbols, { tieEps = 0 } = {}) {
  const groups = new Map()
  for (const s of symbols) {
    const k = keyOf(s); if (!k) continue
    const p = place(s); if (!p) continue
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push({ s, at: p.from, sp: opOf(s)[1] })
  }
  const out = new Map()
  for (const [k, g] of groups) {
    g.sort((a, b) => a.at - b.at || (a.sp === 'off' ? -1 : 1))
    let state = 'off', last = null
    for (const x of g) {
      if (x.sp === state) out.set(x.s.id, { kind: `${x.sp}-${x.sp}`, prev: last?.s ?? null, key: k })
      else state = x.sp
      last = x
    }
  }
  return out
}
export const textOf = sg => LR.snapshotOf(ed, V[sg].id)
export const exprOf = syms => syms.filter(s => s.type === 'expression')
