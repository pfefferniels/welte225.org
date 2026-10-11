import { readingById, edSymbols, edSymbolOfRid } from './base.mjs'
import { blindCollation } from './blind.mjs'
import { compare } from './compare.mjs'
const { clusters } = blindCollation({ linkage: 'single' })
const r = compare(clusters)
const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const rows = []
for (const c of clusters) {
  const eds = [...new Set(c.rids.map(x => edSymbolOfRid.get(x)).filter(Boolean))]
  if (eds.length !== 2) continue
  const [a, b] = eds.map(s => s.rids.map(x => readingById.get(x)))
  const dOn = median(b.map(x => x.from)) - median(a.map(x => x.from)), dEnd = median(b.map(x => x.to)) - median(a.map(x => x.to))
  rows.push({ at: c.from.toFixed(0), key: c.key, a: eds[0].copies.join('+'), b: eds[1].copies.join('+'), dOn: dOn.toFixed(1), dEnd: dEnd.toFixed(1), max: Math.max(Math.abs(dOn), Math.abs(dEnd)).toFixed(1) })
}
console.table(rows)
const m = rows.map(r => +r.max).sort((a, b) => a - b)
console.log('largest end/onset gap between the two edition symbols a blind cluster joins: median', median(m), 'min', m[0], 'max', m.at(-1), '; <=3 mm:', m.filter(x => x <= 3).length, 'of', m.length)
