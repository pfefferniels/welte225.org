import { readFileSync } from 'node:fs'
import * as LR from 'linked-rolls'
import { EDITION } from '../paths.mjs'
const ed = LR.importJsonLd(JSON.parse(readFileSync(EDITION,'utf8')))
const sig = LR.siglaOf(ed)
const r1 = ed.versions.find(v=>sig.get(v.id)==='r1')
const ins = LR.insertedBy(r1)
console.log(JSON.stringify(ins.find(s=>s.type==='expression'),null,1).slice(0,1500))
console.log(JSON.stringify(ins.find(s=>s.type==='note'),null,1).slice(0,800))
const R2 = ed.versions.find(v=>sig.get(v.id)==='R2')
const e = LR.editsOf(R2).slice(0,3)
console.log(JSON.stringify(e,null,1).slice(0,3000))
console.log(JSON.stringify(R2.motivations,null,1).slice(0,3000))
