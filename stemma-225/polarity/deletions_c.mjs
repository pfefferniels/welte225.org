// (c) deletions of R4 and L1 (and R2, r3, L2): what does each predicate say about each deleted reading?
import { readFileSync } from 'node:fs'
import { ed, sig, V, LR, textOf, latchRedundancies, fmt, symById, parentOf, keyOf, place, carrierCopies } from './common.mjs'
const W = 50
const kind = s => s.type === 'note' ? 'n' + s.pitch : s.expressionType + (keyOf(s)?.includes(':') ? s.scope : '')
for (const sg of ['R2', 'r3', 'R4', 'L1', 'L2']) {
  const par = parentOf(sg)
  const tP = textOf(par), tC = textOf(sg)
  const idsP = new Set(tP.map(s => s.id)), idsC = new Set(tC.map(s => s.id))
  const redP = latchRedundancies(tP), redC = latchRedundancies(tC)
  const effP = new Map(JSON.parse(readFileSync(new URL(`eff_${par === 'r5' ? 'R4' : par}.json`, import.meta.url))).map(r => [r.id, r]))
  const emuIneff = id => { const r = effP.get(id); return r && !(Math.abs(r.maxDv) >= 1 || r.damper > 0.05 || r.hammerRail > 0.05) }
  const ins = tC.filter(s => !idsP.has(s.id)), del = tP.filter(s => !idsC.has(s.id))
  const newRed = [...redC.keys()].filter(id => idsP.has(id) && !redP.has(id)) // inherited readings made redundant by this version
  const cats = {}, ex = {}
  const editOf = new Map(); for (const e of LR.editsOf(V[sg])) for (const id of e.delete ?? []) editOf.set(id, e)
  for (const x of del) {
    let c
    if (x.type === 'note') c = 'note (' + (editOf.get(x.id)?.editType ?? '-') + ')'
    else if (redP.has(x.id)) c = 'latch-redundant in parent' + (emuIneff(x.id) ? ' (emu: ineffective)' : ' (emu: EFFECTIVE)')
    else if (ins.some(y => kind(y) === kind(x) && Math.abs(place(y).from - place(x).from) <= W)) c = 'shift (same kind inserted within 50 mm)'
    else {
      // does striking x leave an inherited reading redundant in the child?
      const r = latchRedundancies(tP.filter(s => s.id !== x.id))
      const made = [...r.keys()].filter(id => !redP.has(id) && id !== x.id && redC.has(id))
      c = made.length ? 'effective; striking it leaves a new redundancy' : 'effective; no counterpart'
      if (made.length) (ex[c] ??= []).push(fmt(x) + '→' + made.map(id => fmt(symById.get(id))).join(','))
      else (ex[c] ??= []).push(fmt(x) + '[' + (editOf.get(x.id)?.motivation ?? '-').slice(0, 24) + ']')
    }
    cats[c] = (cats[c] ?? 0) + 1
  }
  console.log(`\n${par} -> ${sg}: ${del.length} deletions`, JSON.stringify(cats, null, 0))
  for (const [k, v] of Object.entries(ex)) console.log('   ', k + ':', v.join(' '))
}
