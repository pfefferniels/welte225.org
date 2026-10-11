import { ed, sig, V, LR, textOf, latchRedundancies, fmt, symById, parentOf, carrierCopies, place } from './common.mjs'
const interesting = e => ['remove-redundancy','add-redundancy'].includes(e.editType) || /cleanup|redundan|accent-withdrawn|made-effective|onset-moved|una-corda-dropped|closing-release|cancel-row/.test(e.motivation ?? '')
for (const v of ed.versions) {
  const sg = sig.get(v.id), par = parentOf(sg)
  if (!par) continue
  const redP = latchRedundancies(textOf(par)), redC = latchRedundancies(textOf(sg))
  for (const e of LR.editsOf(v)) {
    if (!interesting(e)) continue
    const mot = v.motivations.find(m => m.id === e.motivation)?.note ?? e.motivation
    console.log(`\n${sg}<-${par} [${e.editType ?? '-'}] ${e.motivation} :: ${mot}`)
    for (const id of e.delete ?? []) { const s = symById.get(id); const r = redP.get(id); console.log(`   DEL ${fmt(s)} [${carrierCopies(s)}] parentRedundant=${r ? r.kind + ' after ' + (r.prev ? fmt(r.prev) : '-') : 'no'}`) }
    for (const s of e.insert ?? []) { const r = redC.get(s.id); console.log(`   INS ${fmt(s)} [${carrierCopies(s)}] childRedundant=${r ? r.kind + ' after ' + (r.prev ? fmt(r.prev) : '-') : 'no'}`) }
  }
}
