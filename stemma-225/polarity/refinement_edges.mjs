// per-character refinement: does each expression edit of the editor's stemma point "parent -> child" under
// the refinement rule? + insertion of an effective punch, + deletion of a redundant one; - the converse; shift pairs neutral.
import { ed, sig, V, LR, textOf, latchRedundancies, fmt, symById, parentOf, keyOf, place } from './common.mjs'
const W = 50
const kind = s => s.expressionType + (keyOf(s)?.includes(':') ? s.scope : '')
const tot = { plus: 0, minus: 0, neutral: 0 }
for (const sg of ['R1.1', 'R2', 'r3', 'R4', 'L1', 'L2']) {
  const par = parentOf(sg), v = V[sg]
  const tP = textOf(par), tC = textOf(sg)
  const redP = latchRedundancies(tP), redC = latchRedundancies(tC)
  const idsP = new Set(tP.map(s => s.id)), idsC = new Set(tC.map(s => s.id))
  const ins = tC.filter(s => !idsP.has(s.id) && s.type === 'expression' && keyOf(s) && !keyOf(s).startsWith('motor') && place(s).from > 1400 && place(s).from < 9750)
  const del = tP.filter(s => !idsC.has(s.id) && s.type === 'expression' && keyOf(s) && !keyOf(s).startsWith('motor') && place(s).from > 1400 && place(s).from < 9750)
  const c = { insEff: 0, insRed: 0, delRed: 0, delEff: 0, shiftIns: 0, shiftDel: 0 }
  const near = (x, pool) => pool.some(y => kind(y) === kind(x) && Math.abs(place(y).from - place(x).from) <= W)
  for (const s of ins) { if (near(s, del)) c.shiftIns++; else if (redC.has(s.id)) c.insRed++; else c.insEff++ }
  for (const s of del) { if (near(s, ins)) c.shiftDel++; else if (redP.has(s.id)) c.delRed++; else c.delEff++ }
  const plus = c.insEff + c.delRed, minus = c.insRed + c.delEff
  tot.plus += plus; tot.minus += minus; tot.neutral += c.shiftIns + c.shiftDel
  console.log(`${par}->${sg}`.padEnd(10), JSON.stringify(c), ` consistent ${plus} / inconsistent ${minus} (${(100 * plus / (plus + minus)).toFixed(0)}%)`)
}
console.log('total', tot, (100 * tot.plus / (tot.plus + tot.minus)).toFixed(1) + '%')
