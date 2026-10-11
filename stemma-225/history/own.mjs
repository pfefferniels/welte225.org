import { readFileSync } from 'node:fs'
import * as LR from 'linked-rolls'
import { EDITION } from '../paths.mjs'
const ed = LR.importJsonLd(JSON.parse(readFileSync(EDITION, 'utf8')))
const sig = LR.siglaOf(ed)
console.log('isCollationsOwn exported:', typeof LR.isCollationsOwn)
let tot = { all: 0, own: 0, typed: 0, motivated: 0, annotated: 0 }
for (const v of ed.versions) {
  const es = LR.editsOf(v)
  const own = es.filter(e => LR.isCollationsOwn(e)).length
  const typed = es.filter(e => e.editType).length
  const motivated = es.filter(e => e.motivation && e.motivation !== 'unchecked').length
  const unchecked = es.filter(e => e.motivation === 'unchecked').length
  const annotated = es.filter(e => e['@annotation'] || e.annotation).length
  const der = LR.derivationsOf(v).map(d => `${sig.get(d.parent)}[${d.certainty}]`).join(',')
  const tol = (v.basedOn ?? []).map(b => b.collationTolerance ? `${(+b.collationTolerance.toleranceStart).toFixed(2)}/${(+b.collationTolerance.toleranceEnd).toFixed(2)}${b.collationTolerance.offsetStart ? ' off ' + (+b.collationTolerance.offsetStart).toFixed(2) : ''}` : '-').join(',')
  console.log(sig.get(v.id).padEnd(5), v.id.slice(0, 8), '<-', der.padEnd(28), 'tol', tol.padEnd(22), `edits ${es.length} ins ${LR.insertedBy(v).length} del ${LR.deletedBy(v).length} collationsOwn ${own} typed ${typed} motivated ${motivated} unchecked ${unchecked} annotated ${annotated}`)
  tot.all += es.length; tot.own += own; tot.typed += typed; tot.motivated += motivated; tot.annotated += annotated
}
console.log(tot)
for (const c of ed.copies) console.log(c.siglum ?? LR.nameOf?.(c), (c.carries ?? []).map(s => `${sig.get(LR.idOf(s))}[${s['@annotation']?.belief?.certainty ?? s.annotation?.belief?.certainty ?? 'true'}]`).join(' '))
