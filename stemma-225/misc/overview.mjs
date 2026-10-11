import { readFileSync } from 'node:fs'
import * as LR from 'linked-rolls'
import { EDITION } from '../paths.mjs'
const json = JSON.parse(readFileSync(EDITION,'utf8'))
const ed = LR.importJsonLd(json)
const sig = LR.siglaOf(ed)
console.log('exports:', Object.keys(LR).length)
console.log('copies:', ed.copies.length)
const copySig = c => c.siglum ?? c.label ?? c.id
for (const c of ed.copies) {
  const nf = (c.features??[]).length
  console.log('COPY', c.id.slice(0,8), Object.keys(c).join(','), 'features', nf, 'carries', JSON.stringify((c.carries??[]).map(s=>sig.get(LR.idOf? LR.idOf(s): s.id))))
}
for (const v of ed.versions) {
  const edits = v.edits ?? []
  const byType = {}
  const byMot = {}
  for (const e of edits) { byType[e.editType??'-']=(byType[e.editType??'-']??0)+1; byMot[e.motivation??'-']=(byMot[e.motivation??'-']??0)+1 }
  const ins = edits.reduce((n,e)=>n+(e.insert?.length??0),0), del = edits.reduce((n,e)=>n+(e.delete?.length??0),0)
  console.log('VERSION', sig.get(v.id), v.id.slice(0,8), 'system', v.system?.id ?? v.system?.name, 'basedOn', JSON.stringify((v.basedOn??[]).map(d=>[sig.get(d.id), d['@annotation']?.belief?.certainty ?? d['@annotation']?.certainty])), 'edits', edits.length, 'ins', ins, 'del', del)
  console.log('   types', JSON.stringify(byType))
  console.log('   motivations', JSON.stringify(byMot))
  console.log('   motiv defs', JSON.stringify(v.motivations.map(m=>m.id)))
}
console.log('---- copies detail')
for (const c of ed.copies) {
  const fs = LR.featuresOf(c)
  const mods = c.modifications.map(m => `${m.type}:${(LR.featuresMadeBy(m)).length}${m.purpose? '('+m.purpose+')':''}`)
  const nsym = new Set()
  console.log(c.siglum, c.id.slice(0,8), 'system', c.production?.system?.id?.split('/').pop(), 'date', JSON.stringify(c.production?.date?.['@annotation']? c.production.date : c.production?.date)?.slice(0,120), 'features', fs.length, 'readFrom', c.readFrom?.type ?? JSON.stringify(c.readFrom)?.slice(0,80), 'mods', mods.join(' '))
}
// witnesses
console.log('---- witnesses')
for (const v of ed.versions) console.log(sig.get(v.id), JSON.stringify(LR.witnessesOf(ed, v.id).map(w => [ed.copies.find(c=>c.id===w.copy)?.siglum, w.by, w.through && sig.get(w.through), w.certainty])))
