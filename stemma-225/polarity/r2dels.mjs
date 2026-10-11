import { ed, sig, V, LR, textOf, latchRedundancies, fmt, symById, carrierCopies } from './common.mjs'
const redr1 = latchRedundancies(textOf('r1'))
const redWi = latchRedundancies(textOf('R1.1'))
let n = 0
for (const e of LR.editsOf(V['R2'])) {
  if (!(e.delete?.length)) continue
  n++
  console.log(`[${e.editType ?? '-'}/${e.motivation?.slice(0,25) ?? '-'}] DEL ${e.delete.map(id => { const s = symById.get(id); return fmt(s) + (redr1.has(id) ? '(R:r1)' : '') + (redWi.has(id) ? '(R:Wi)' : '') }).join(' ')}  INS ${(e.insert ?? []).map(s => fmt(s) + '[' + carrierCopies(s).join('') + ']').join(' ')}`)
}
console.log('edits with deletions', n)
