// Bridged chains read as one perforation on one copy and as several on another: same key, copy B has >= 2
// readings separated by a gap < 3 mm, all lying within one reading of copy A.
import { readings, edSymbolOfRid, COPIES } from './base.mjs'
import { blindCollation } from './blind.mjs'
const { clusters } = blindCollation({ linkage: 'single' })
const clusterOf = new Map(); clusters.forEach((c, i) => c.rids.forEach(r => clusterOf.set(r, i)))
const byCK = new Map(); for (const r of readings) { const k = r.copy + '|' + r.key; (byCK.get(k) ?? byCK.set(k, []).get(k)).push(r) }
for (const v of byCK.values()) v.sort((a, b) => a.from - b.from)
const found = []
for (const [k, rs] of byCK) for (let i = 0; i + 1 < rs.length; i++) {
  const a = rs[i], b = rs[i + 1]
  if (b.from - a.to >= 3 || b.from - a.to < -0.5) continue
  // a run on this copy; does another copy read the stretch as one?
  const others = readings.filter(o => o.key === a.key && o.copy !== a.copy && o.from <= a.from + 3 && o.to >= b.to - 3)
  found.push({ copy: a.copy, key: a.key, at: a.from.toFixed(1), gap: (b.from - a.to).toFixed(2), readAsOneBy: [...new Set(others.map(o => o.copy))].join('+'),
    edition: [a, b].map(x => edSymbolOfRid.get(x.rid)?.copies.join('+') ?? '-').join(' | '), blind: [a, b].map(x => clusters[clusterOf.get(x.rid)].pattern).join(' | ') })
}
console.table(found)
