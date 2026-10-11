// Pairwise polarity votes between copy texts from computable predicates
// R: X in A\B redundant in A  -> A earlier (B cleaned it)              [refinement, 2nd clause; independent-cleanup]
// E: X in A\B, adding X to B makes a redundancy of B effective -> A earlier (B struck X, leaving a trace) [explain-redundancy]
// F: X in A\B effective in A, no shift, no E -> B earlier (A added a dynamic punch)   [refinement, 1st clause]
// shift: same kind in B\A within W -> no vote
import { writeFileSync } from 'node:fs'
import { ed, LR, latchRedundancies, fmt, symById, carrierCopies, place, keyOf, opOf } from './common.mjs'
const W = +(process.argv[2] ?? 50), H = +(process.argv[3] ?? 1e9), NOFZ = process.argv[4] === 'nofz'
const all = [...symById.values()]
const copyText = c => all.filter(s => carrierCopies(s).includes(c)).sort((a, b) => place(a).from - place(b).from)
const kind = s => s.type === 'note' ? 'n' + s.pitch : s.expressionType + (keyOf(s)?.includes(':') ? s.scope : '')
const copies = ['Wi1', 'St1', 'St2', 'Ch1', 'Ne1']
const T = Object.fromEntries(copies.map(c => [c, copyText(c)]))
const RED = Object.fromEntries(copies.map(c => [c, latchRedundancies(T[c])]))
// restrict to the music proper and to latched dynamics/pedals (no notes, no rewind/motor, no leader cancel row)
const first = Math.min(...T.St1.filter(s => s.type === 'note').map(s => place(s).from)) - 30
const last = Math.max(...T.St1.filter(s => s.type === 'note').map(s => place(s).to)) + 30
const inScope = s => s.type === 'expression' && keyOf(s) && !keyOf(s).startsWith('motor') && place(s).from > first && place(s).from < last
function votes(A, B) {
  const ids = new Set(T[B].map(s => s.id))
  const idsA = new Set(T[A].map(s => s.id))
  const AminusB = T[A].filter(s => !ids.has(s.id) && inScope(s))
  const BminusA = T[B].filter(s => !idsA.has(s.id) && inScope(s))
  const v = { R: 0, E: 0, F: 0, shift: 0 }, ex = { R: [], E: [], F: [] }
  for (const x of AminusB) {
    const near = BminusA.some(y => kind(y) === kind(x) && Math.abs(place(y).from - place(x).from) <= W)
    if (RED[A].has(x.id) && !(NOFZ && keyOf(x).startsWith('sforzando'))) { v.R++; ex.R.push(fmt(x)); continue }
    const r = latchRedundancies([...T[B], x])
    const resolved = [...RED[B].keys()].filter(id => !r.has(id) && idsA.has(id) && Math.abs(place(symById.get(id)).from - place(x).from) <= H && !(NOFZ && keyOf(x).startsWith('sforzando')))
    if (resolved.length) { v.E++; ex.E.push(fmt(x) + '→' + resolved.map(id => fmt(symById.get(id))).join(',')); continue }
    if (near) { v.shift++; continue }
    v.F++; ex.F.push(fmt(x))
  }
  return { v, ex, n: AminusB.length }
}
const out = {}
console.log(`W=${W}. Votes "A earlier than B" (R,E from A\\B) vs "B earlier" (F from A\\B), and the same from B\\A`)
for (let i = 0; i < copies.length; i++) for (let j = i + 1; j < copies.length; j++) {
  const A = copies[i], B = copies[j]
  const ab = votes(A, B), ba = votes(B, A)
  const aEarlier = { R: ab.v.R + 0, E: ab.v.E, F: ba.v.F }, bEarlier = { R: ba.v.R, E: ba.v.E, F: ab.v.F }
  const sum = o => o.R + o.E + o.F
  console.log(`${A} vs ${B}: |A\\B|=${ab.n} |B\\A|=${ba.n} | ${A} earlier: R${aEarlier.R} E${aEarlier.E} F${aEarlier.F} = ${sum(aEarlier)} | ${B} earlier: R${bEarlier.R} E${bEarlier.E} F${bEarlier.F} = ${sum(bEarlier)} | shifts ${ab.v.shift}+${ba.v.shift}  => ${sum(aEarlier) > sum(bEarlier) ? A : B} earlier; strong(E) ${aEarlier.E}:${bEarlier.E}`)
  out[`${A}|${B}`] = { ab, ba }
}
writeFileSync(new URL(`pairvotes_W${W}_H${H}${NOFZ?'_nofz':''}.json`, import.meta.url), JSON.stringify(out, null, 1))
