import { readFileSync } from 'node:fs'
import * as LR from 'linked-rolls'
import { EDITION } from '../paths.mjs'
const ed = LR.importJsonLd(JSON.parse(readFileSync(EDITION,'utf8')))
const sig = LR.siglaOf(ed)
const byS = new Map([...sig].map(([id,s])=>[s,id]))
for (const [s, lo, hi, scope, re] of [['R2',8480,8700,'treble',/Crescendo/],['r3',8480,8700,'treble',/Crescendo/],['R4',8480,8700,'treble',/Crescendo/],['r1',8480,8700,'treble',/Crescendo/],
  ['r3',6700,6900,null,/Sustain/],['L1',6700,6900,null,/Sustain/],['r3',2840,2920,'treble',/Crescendo/],['L1',2840,2920,'treble',/Crescendo/]]) {
  const syms = LR.snapshotOf(ed, byS.get(s)).filter(x => x.type==='expression' && re.test(x.expressionType) && (!scope || x.scope===scope))
    .map(x => ({ x, p: LR.placeOf(ed, x) })).filter(({p}) => p && p.from>lo && p.from<hi)
  console.log(s, lo+'-'+hi, syms.map(({x,p}) => `${x.expressionType}/${x.scope}@${p.from.toFixed(1)}`).join('  '))
}
// motivation of L1 edit near 6795
const L1 = ed.versions.find(v=>v.id===byS.get('L1'))
for (const e of L1.edits) for (const s of e.insert??[]) { const p = LR.placeOf(ed,s); if (p && p.from>6780 && p.from<6810) console.log('L1 edit', e.editType, e.motivation, s.expressionType, p.from.toFixed(1)) }
const R4 = ed.versions.find(v=>v.id===byS.get('R4'))
for (const e of R4.edits) for (const s of e.insert??[]) { const p = LR.placeOf(ed,s); if (p && p.from>8590 && p.from<8620) console.log('R4 edit', e.editType, e.motivation, s.expressionType, s.scope, p.from.toFixed(1)) }
