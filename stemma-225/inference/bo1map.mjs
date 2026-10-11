// Version-independent mapping of Bo1's green (held) expression commands onto the red/Licensee
// latched on/off readings, using linked-rolls' substitutionsBetween (per red copy text).
// Output: bo1map.json { tol: { symbolId: '1' | '0' | '?' } } for every red-vocabulary expression symbol.
import { readFileSync, writeFileSync } from 'node:fs'
import * as LR from 'linked-rolls'
import { EDITION } from '../paths.mjs'
const ed = LR.importJsonLd(JSON.parse(readFileSync(EDITION, 'utf8')))
const OUT = new URL('./', import.meta.url)   // this directory
const featCopy = new Map()
for (const c of ed.copies) for (const f of LR.featuresOf(c)) featCopy.set(f.id, c.siglum)
const symbols = new Map()
for (const v of ed.versions) for (const s of LR.insertedBy(v)) symbols.set(s.id, s)
const copiesOf = s => new Set(s.carriers.map(r => featCopy.get(LR.idOf(r))).filter(Boolean))
const placeCache = new Map()
const locate = s => { if (!placeCache.has(s.id)) placeCache.set(s.id, LR.placeOf(ed, s)); return placeCache.get(s.id) }
const all = [...symbols.values()]
const bo1Green = all.filter(s => s.type === 'expression' && copiesOf(s).has('Bo1'))
const RED = ['St1', 'St2', 'Wi1', 'Ch1', 'Ne1']
const redExpr = all.filter(s => s.type === 'expression' && [...copiesOf(s)].some(c => RED.includes(c)))
const fkey = s => { const op = LR.operationOf(s.expressionType); return op ? (op.sided ? `${op.operates} ${s.scope}` : op.operates) : undefined }

// latched intervals of a red text (same logic as substitution.ts latchedIn)
const latched = syms => {
  const by = new Map()
  for (const s of syms) {
    const op = LR.operationOf(s.expressionType); const at = locate(s)?.from
    if (!op || op.spelling === 'held' || at === undefined) continue
    const k = fkey(s); (by.get(k) ?? by.set(k, []).get(k)).push({ s, at, sp: op.spelling })
  }
  const out = []
  for (const [k, g] of by) {
    g.sort((a, b) => a.at - b.at); let open
    for (const e of g) {
      if (e.sp === 'on') { if (!open) open = e }
      else if (open) { out.push({ on: open.s, off: e.s, from: open.at, to: e.at, key: k }); open = undefined }
    }
  }
  return out
}
// green held runs (chained)
const runs = (syms, gap = 3) => {
  const by = new Map()
  for (const s of syms) { const p = locate(s); const k = fkey(s); if (!p || !k) continue; (by.get(k) ?? by.set(k, []).get(k)).push({ s, from: p.from, to: p.to }) }
  const out = []
  for (const [k, g] of by) { g.sort((a, b) => a.from - b.from); for (const p of g) { const o = out.length && out[out.length - 1].key === k ? out[out.length - 1] : undefined; if (o && p.from - o.to <= gap) { o.to = Math.max(o.to, p.to); o.of.push(p.s) } else out.push({ key: k, from: p.from, to: p.to, of: [p.s] }) } }
  return out
}
const result = {}
const stats = {}
for (const tol of [5, 10]) {
  const T = { toleranceStart: tol, toleranceEnd: tol }
  const mapped = new Set(), latchedIds = new Set(), coveredByRun = new Set()
  const greenRuns = runs(bo1Green)
  for (const X of RED) {
    const xs = redExpr.filter(s => copiesOf(s).has(X))
    for (const sub of LR.substitutionsBetween(bo1Green, xs, locate, T)) for (const r of sub.replaced) mapped.add(r.id)
    for (const iv of latched(xs)) {
      latchedIds.add(iv.on.id); latchedIds.add(iv.off.id)
      const overl = greenRuns.some(r => r.key === iv.key && r.from <= iv.to + tol && r.to >= iv.from - tol)
      if (overl) { coveredByRun.add(iv.on.id); coveredByRun.add(iv.off.id) }
    }
  }
  const m = {}
  const cnt = { '1': 0, '0': 0, '?': 0 }
  for (const s of redExpr) {
    const st = mapped.has(s.id) ? '1' : (latchedIds.has(s.id) && !coveredByRun.has(s.id)) ? '0' : '?'
    m[s.id] = st; cnt[st]++
  }
  result[tol] = m; stats[tol] = cnt
}
writeFileSync(new URL('bo1map.json', OUT), JSON.stringify(result))
console.log('green Bo1 expr', bo1Green.length, 'red expr', redExpr.length, stats)
