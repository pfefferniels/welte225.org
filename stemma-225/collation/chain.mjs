// The library's own ops on a scratch edition with every version stripped: one version per copy as createVersion
// makes it, then connectVersions along a chain or a star. Shows what the stemma-bound collation does without a stemma.
import { produce, setAutoFreeze } from 'immer'
import { LR, ed, readings, edSymbols, COPIES, copyBySig } from './base.mjs'
const textRid = new Set(readings.map(r => r.rid))
const keyOf = s => LR.keyOf(s)
function run(order, topology, tolerance) {
  let e = { ...ed, versions: [] }
  e = produce(e, d => { for (const s of order) { const c = copyBySig[s], bar = LR.barOf(c)
    d.versions.push({ id: 'v-' + s, system: LR.systemOf(bar), motivations: [],
      edits: LR.asSymbols(LR.featuresOf(c), bar).map(sym => ({ type: 'edit', id: 'e-' + sym.id, insert: [sym] })) }) } })
  for (let i = 1; i < order.length; i++) e = produce(e, LR.connectVersions('v-' + order[i], 'v-' + (topology === 'chain' ? order[i - 1] : order[0]), tolerance))
  const syms = e.versions.flatMap(v => (v.edits ?? []).flatMap(x => x.insert ?? []))
  const sets = syms.map(s => s.carriers.map(c => LR.idOf(c) + '|' + keyOf(s)).filter(r => textRid.has(r)).sort()).filter(s => s.length)
  const keyset = new Set(sets.map(s => s.join(',')))
  const exact = edSymbols.filter(s => keyset.has([...s.rids].sort().join(','))).length
  const mult = new Map(); sets.flat().forEach(r => mult.set(r, (mult.get(r) ?? 0) + 1))
  const recodings = e.versions.flatMap(v => (v.edits ?? []).filter(x => x.editType === 'recoding')).length
  return { order: order.join(','), topology, symbols: sets.length, exact, pct: (100 * exact / edSymbols.length).toFixed(1), readingsInTwoSymbols: [...mult.values()].filter(n => n > 1).length, recodings }
}
const tol = { toleranceStart: 5, toleranceEnd: 5 }
const rows = []
for (const order of [['St1', 'St2', 'Wi1', 'Ch1', 'Bo1', 'Ne1'], ['Ne1', 'Ch1', 'Bo1', 'Wi1', 'St2', 'St1'], ['St2', 'Ch1', 'Bo1', 'St1', 'Ne1', 'Wi1']])
  for (const topology of ['chain', 'star']) rows.push(run(order, topology, tol))
console.table(rows)
