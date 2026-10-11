import { readFileSync } from 'node:fs'
import * as LR from 'linked-rolls'
import { EDITION } from '../paths.mjs'
const json = JSON.parse(readFileSync(EDITION,'utf8'))
const ed = LR.importJsonLd(json)
const sig = LR.siglaOf(ed)
const notes = s => typeof s === 'string' ? s.replace(/\{\{([^}]+)\}\}/g, (_, id) => sig.get(id) ?? ed.copies.find(c=>c.id===id)?.siglum ?? id.slice(0,8)) : s
for (const v of ed.versions) {
  for (const d of v.basedOn ?? []) {
    console.log(`\n### ${sig.get(v.id)} <- ${sig.get(d.id)}`)
    console.log((notes(JSON.stringify(d['@annotation'], null, 1)) ?? '(no annotation)').slice(0, 6000))
    console.log('tolerance', JSON.stringify(d.collationTolerance))
  }
  if (v.creation) console.log('creation', sig.get(v.id), notes(JSON.stringify(v.creation)).slice(0,1500))
}
