// Would a stemma built on the blind matrix be stable? Pairwise copy distances (share of applicable clusters where
// one copy has the reading and the other not) at several windows, and the edition's own symbols for comparison.
import { writeFileSync } from 'node:fs'
import { COPIES, edSymbols } from './base.mjs'
import { pairWindows, blindCollation } from './blind.mjs'
import { withGreen } from './greenlinks.mjs'
import { ed, sig } from './base.mjs'
const windows = pairWindows(8)
const applicable = (c, kind) => true
function dist(units) { // units: [{kind, copies}]
  const D = {}
  for (const a of COPIES) for (const b of COPIES) { if (a >= b && a !== b) {} }
  for (let i = 0; i < COPIES.length; i++) for (let j = i + 1; j < COPIES.length; j++) {
    const a = COPIES[i], b = COPIES[j]; let n = 0, d = 0
    for (const u of units) { if (!applicable(a, u.kind) || !applicable(b, u.kind)) continue; const ha = u.copies.includes(a), hb = u.copies.includes(b); if (!ha && !hb) continue; n++; if (ha !== hb) d++ }
    D[a + '-' + b] = +(d / n).toFixed(3)
  }
  return D
}
const units = o => withGreen(blindCollation({ windows, linkage: 'single', ...o }).clusters)
const g1 = ed.versions.find(v => sig.get(v.id) === 'G1')
const recoded = new Set(g1.edits.filter(e => e.editType === 'recoding' && e.insert?.length && e.delete?.length).flatMap(e => e.delete))
const sets = { edition: edSymbols.filter(s => !(s.kind === 'expression' && s.copies.includes('Bo1'))).map(s => ({ kind: s.kind, copies: recoded.has(s.id) ? [...s.copies, 'Bo1'] : s.copies })) }
for (const [n, o] of [['scatter', {}], ['3.5', { fixed: 3.5 }], ['5', { fixed: 5 }], ['8', { fixed: 8 }], ['2', { fixed: 2 }], ['onset only', { onsetOnly: true }]]) sets[n] = units(o)
const table = {}
for (const [n, u] of Object.entries(sets)) table[n] = dist(u)
const pairs = Object.keys(table.edition)
console.table(pairs.map(p => Object.fromEntries([['pair', p], ...Object.entries(table).map(([n, D]) => [n, D[p]])])))
// nearest neighbour of each copy, per set
for (const [n, D] of Object.entries(table)) {
  const nn = COPIES.map(c => { let best, bd = Infinity; for (const o of COPIES) { if (o === c) continue; const d = D[[c, o].sort((x, y) => COPIES.indexOf(x) - COPIES.indexOf(y)).join('-')]; if (d < bd) { bd = d; best = o } } return `${c}->${best}` })
  const ranking = Object.entries(D).sort((a, b) => a[1] - b[1]).map(([p]) => p).join(' < ')
  console.log(n.padEnd(10), nn.join(' '), '|', ranking)
}
writeFileSync(new URL('out/distances.json', import.meta.url), JSON.stringify(table, null, 1))
