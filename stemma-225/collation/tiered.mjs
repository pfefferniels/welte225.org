// A precision-tiered variant: the copies whose scatter is small (St1, St2, Wi1, Bo1: sigma <= ~1 mm) are collated
// first among themselves; the coarse readings (Ch1 scan at 180 dpi, Ne1 pneumatic e-roll) are then attached,
// nearest first, to a cluster that admits them, so a coarse copy can no longer bridge two precise readings.
import { readings } from './base.mjs'
import { pairWindows, edgesOf, cluster, measure } from './blind.mjs'
import { compare } from './compare.mjs'
export function tiered(windows = pairWindows(8), opts = {}) {
  const precise = new Set(['St1', 'St2', 'Wi1', 'Bo1'])
  const edges = edgesOf(windows, opts)
  const stage1 = edges.filter(e => precise.has(e.x.copy) && precise.has(e.y.copy))
  // stage 2: every admitted edge between a precise and a coarse reading, or between two coarse readings, joined
  // nearest first, but a join must not connect two clusters that both already hold precise readings
  const rest = edges.filter(e => !(precise.has(e.x.copy) && precise.has(e.y.copy)))
  const first = cluster(readings, stage1, 'single')
  const parent = new Map(), members = new Map()
  first.forEach((c, i) => { members.set('c' + i, c.rids); c.rids.forEach(r => parent.set(r, 'c' + i)) })
  const rById = new Map(readings.map(r => [r.rid, r]))
  const find = r => parent.get(r)
  for (const { x, y } of rest) {
    const a = find(x.rid), b = find(y.rid); if (a === b) continue
    const A = members.get(a).map(r => rById.get(r)), B = members.get(b).map(r => rById.get(r))
    if (A.some(p => B.some(q => p.copy === q.copy))) continue
    if (A.some(p => precise.has(p.copy)) && B.some(q => precise.has(q.copy))) continue
    const merged = [...members.get(a), ...members.get(b)]
    members.set(a, merged); members.delete(b); for (const r of merged) parent.set(r, a)
  }
  const median = xs => { const s = [...xs].sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
  const ORDER = ['St1', 'St2', 'Wi1', 'Ch1', 'Bo1', 'Ne1']
  return [...members.values()].map(rids => { const rs = rids.map(r => rById.get(r)); const copies = ORDER.filter(c => rs.some(r => r.copy === c))
    return { key: rs[0].key, kind: rs[0].kind, copies, pattern: copies.join('+'), from: median(rs.map(r => r.from)), to: median(rs.map(r => r.to)), rids: [...rids].sort(), features: rs.map(r => r.fid).sort() } })
    .sort((p, q) => p.from - q.from || (p.key < q.key ? -1 : 1))
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const cl = tiered()
  const r = compare(cl)
  console.log('tiered: clusters', cl.length, 'exact', r.exact, (100 * r.exact / r.n).toFixed(1) + '%', JSON.stringify(r.tallyKind), 'pairs onlyEd', r.pairs.onlyEdition.length, 'onlyBl', r.pairs.onlyBlind.length)
}
