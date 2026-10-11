import { readFileSync } from 'node:fs'
import * as LR from 'linked-rolls'
import { EDITION } from '../paths.mjs'
const ed = LR.importJsonLd(JSON.parse(readFileSync(EDITION, 'utf8')))
const sig = LR.siglaOf(ed)
const all = new Map(); const home = new Map()
for (const v of ed.versions) for (const s of LR.insertedBy(v)) { all.set(s.id, s); home.set(s.id, sig.get(v.id)) }
const d = s => { const p = LR.placeOf(ed, s); const cs = [...new Set(s.carriers.map(c => LR.copyOfFeature(ed, LR.idOf(c))?.siglum))].join('+'); return `${home.get(s.id)}:${s.expressionType ?? s.pitch}${s.scope ? '/' + s.scope : ''}@${p?.from.toFixed(1)}[${cs}]` }
for (const sg of process.argv.slice(2)) {
  const v = ed.versions.find(v => sig.get(v.id) === sg)
  console.log('==', sg)
  for (const e of LR.editsOf(v)) {
    const ins = e.insert ?? [], del = (e.delete ?? []).map(id => all.get(id)).filter(Boolean)
    const ne1only = [...ins, ...del].some(s => s.carriers.every(c => LR.copyOfFeature(ed, LR.idOf(c))?.siglum === 'Ne1'))
    if (process.env.ALL || ne1only) console.log('  ', e.editType ?? '-', e.motivation ?? '-', 'INS', ins.map(d).join(' | '), 'DEL', del.map(d).join(' | '))
  }
}
