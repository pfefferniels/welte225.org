// mirror problem: readings in St1 but not in Wi1 -- R2's insertion, or an r1 reading R1.1 struck?
import { ed, LR, latchRedundancies, fmt, symById, carrierCopies, place, insertedIn, keyOf } from './common.mjs'
const all = [...symById.values()]
const copyText = c => all.filter(s => carrierCopies(s).includes(c)).sort((a, b) => place(a).from - place(b).from)
const TA = copyText('St1'), TB = copyText('Wi1')
const idsB = new Set(TB.map(s => s.id))
const X = TA.filter(s => !idsB.has(s.id))
const redA = latchRedundancies(TA), redB = latchRedundancies(TB)
const H = +(process.argv[2] ?? 100)
const t = {}
for (const x of X) {
  const truth = insertedIn.get(x.id) === 'r1' ? 'r1' : 'R2'
  let pred = 'R2', why = 'refinement'
  if (x.type === 'expression' && keyOf(x)) {
    const r = latchRedundancies([...TB, x])
    const idsA = new Set(TA.map(s => s.id)); const res = [...redB.keys()].filter(id => !r.has(id) && idsA.has(id) && Math.abs(place(symById.get(id)).from - place(x).from) <= H)
    if (res.length) { pred = 'r1'; why = 'explain-redundancy: ' + res.map(id => fmt(symById.get(id))).join(',') }
  }
  t[`${truth}->${pred}`] = (t[`${truth}->${pred}`] ?? 0) + 1
  if (pred !== 'R2' || truth !== 'R2') console.log(truth, '->', pred, fmt(x), why, redA.has(x.id) ? '(redundant in St1)' : '')
}
console.log(`St1-not-Wi1 readings ${X.length}; horizon ${H} mm; confusion`, t)
