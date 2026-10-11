import { ed, sig, V, textOf, latchRedundancies, fmt, exprOf, carrierCopies } from './common.mjs'
for (const sg of ['r1','R1.1','R2','r3','R4','L1','L2','r5']) {
  const t = textOf(sg)
  const red = latchRedundancies(t)
  const byKind = {}
  for (const [id, r] of red) { const k = r.key + ' ' + r.kind; byKind[k] = (byKind[k] ?? 0) + 1 }
  console.log(sg, 'symbols', t.length, 'expr', exprOf(t).length, 'redundant', red.size, JSON.stringify(byKind))
}
