import { ed, sig, V, LR, symById, fmt, textOf, latchRedundancies, carrierCopies, place } from './common.mjs'
import { effectOf, contextOf, baseline } from './emu.mjs'
const find = (sg, pre) => textOf(sg).filter(s => fmt(s).startsWith(pre))
const detail = (sg, ids) => { const base = baseline(sg); const r = effectOf(sg, { remove: ids }); return r }
for (const sg of ['r1', 'R1.1']) {
  const on1964 = find(sg, 'CrOn.t@1964')[0], off1986 = find(sg, 'CrOff.t@1986')[0]
  const on2873 = find(sg, 'CrOn.t@2872')[0], off2893 = find(sg, 'CrOff.t@2893')[0]
  console.log(sg, 'accent 1964 (On+Off)', JSON.stringify(effectOf(sg, { remove: [on1964.id, off1986.id] })))
  console.log(sg, 'On 1964 only', JSON.stringify(effectOf(sg, { remove: [on1964.id] })))
  console.log(sg, 'On 2873 only', JSON.stringify(effectOf(sg, { remove: [on2873.id] })))
  console.log(sg, 'On 2873 + Off 2893', JSON.stringify(effectOf(sg, { remove: [on2873.id, off2893.id] })))
}
// treble crescendo context around 2800-2950 in r1, R2, r3, L1
for (const sg of ['r1', 'R2', 'r3', 'L1']) {
  const red = latchRedundancies(textOf(sg))
  console.log(sg, textOf(sg).filter(s => s.type === 'expression' && s.scope === 'treble' && /Crescendo/.test(s.expressionType) && place(s).from > 2780 && place(s).from < 2960).map(s => fmt(s) + (red.has(s.id) ? '(RED)' : '') + '[' + carrierCopies(s).join('') + ']').join(' '))
}
