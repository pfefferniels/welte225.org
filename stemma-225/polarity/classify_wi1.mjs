// Wi1-only readings: r1 (struck/moved by R2) vs R1.1 (own insertion)?
import { ed, sig, V, LR, textOf, latchRedundancies, fmt, symById, carrierCopies, place, insertedIn, keyOf } from './common.mjs'
const all = [...symById.values()]
const wi1only = all.filter(s => { const c = carrierCopies(s); return c.length === 1 && c[0] === 'Wi1' })
const truth = s => insertedIn.get(s.id) === 'r1' ? 'r1' : 'R1.1'
// other-branch readings: carried by St1, not by Wi1
const otherBranch = all.filter(s => { const c = carrierCopies(s); return c.includes('St1') && !c.includes('Wi1') })
console.log('St1-not-Wi1 readings', otherBranch.length, Object.entries(otherBranch.reduce((t, s) => (t[insertedIn.get(s.id)] = (t[insertedIn.get(s.id)] ?? 0) + 1, t), {})))
const kind = s => s.type === 'note' ? 'n' + s.pitch : s.expressionType + (keyOf(s)?.includes(':') ? s.scope : '')
const nearest = (x, pool) => { let best = Infinity, who = null; const px = place(x).from
  for (const y of pool) { if (kind(y) !== kind(x)) continue; const d = Math.abs(place(y).from - px); if (d < best) { best = d; who = y } } return [best, who] }
// Wi1's text: R1.1 snapshot (all Wi1-carried readings) ; check equals copy content
const wiText = textOf('R1.1')
const redWi = latchRedundancies(wiText)
// St1 text with X added (hypothetical r1-like context on the other side)
const st1Text = textOf('R2')
const rows = wi1only.map(x => {
  const [d, y] = nearest(x, otherBranch)
  const redInSt1Ctx = latchRedundancies([...st1Text, x]).has(x.id)
  return { x, truth: truth(x), d, y, red: redWi.has(x.id), redSt1: redInSt1Ctx }
})
rows.sort((a, b) => place(a.x).from - place(b.x).from)
for (const r of rows) console.log(r.truth.padEnd(5), fmt(r.x).padEnd(18), 'nearest same kind in St1-branch:', r.y ? `${fmt(r.y)} d=${r.d.toFixed(1)}` : '-', r.red ? 'REDUNDANT(Wi1)' : '', r.redSt1 ? 'REDUNDANT(in St1 ctx)' : '')
const conf = (pred) => { const t = { 'r1/r1': 0, 'r1/R1.1': 0, 'R1.1/r1': 0, 'R1.1/R1.1': 0 }; for (const r of rows) t[`${r.truth}/${pred(r)}`]++; return t }
for (const W of [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100]) {
  console.log(`W=${W}`, 'shift only', JSON.stringify(conf(r => r.d <= W ? 'r1' : 'R1.1')), ' shift|redWi', JSON.stringify(conf(r => (r.d <= W || r.red) ? 'r1' : 'R1.1')), ' shift|redSt1ctx', JSON.stringify(conf(r => (r.d <= W || r.redSt1) ? 'r1' : 'R1.1')))
}
import { writeFileSync } from 'node:fs'
writeFileSync(new URL('wi1only_features.json', import.meta.url), JSON.stringify(rows.map(r => ({ id: r.x.id, sym: fmt(r.x), truth: r.truth, nearest: r.y && fmt(r.y), d: r.d, redWi1: r.red, redSt1ctx: r.redSt1 })), null, 1))
