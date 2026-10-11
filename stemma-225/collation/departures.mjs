// A scatter screen over the blind clusters, as scatter.ts screens a derivation: each copy's reading against the
// median of the other copies in its cluster; per copy and group a MAD-sigma and the threshold k(n); a reading
// beyond k at either end is a departure. Does the screen find the readings the editor separated by hand?
import { LR, readings, readingById, edSymbolOfRid, COPIES, groupOfKey } from './base.mjs'
import { blindCollation, measure } from './blind.mjs'
import { compare } from './compare.mjs'
const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export function screen(clusters, minSize = 3) {
  const samples = new Map()
  const disp = []
  for (const [ci, c] of clusters.entries()) {
    if (c.rids.length < minSize) continue
    const rs = c.rids.map(r => readingById.get(r))
    for (const r of rs) {
      const others = rs.filter(o => o !== r)
      const d = { ci, r, from: r.from - median(others.map(o => o.from)), to: r.to - median(others.map(o => o.to)) }
      disp.push(d)
      const k = r.copy + '|' + groupOfKey(r.key)
      ;(samples.get(k) ?? samples.set(k, []).get(k)).push(d)
    }
  }
  const stats = new Map()
  for (const [k, ds] of samples) {
    const sf = LR.spreadOf(ds.map(d => d.from)), st = LR.spreadOf(ds.map(d => d.to)), kk = LR.departureThreshold(ds.length)
    stats.set(k, { n: ds.length, k: kk, mf: sf.median, sf: sf.sigma, mt: st.median, st: st.sigma })
  }
  for (const d of disp) {
    const s = stats.get(d.r.copy + '|' + groupOfKey(d.r.key))
    d.zf = (d.from - s.mf) / s.sf; d.zt = (d.to - s.mt) / s.st; d.k = s.k
    d.departs = Math.max(Math.abs(d.zf), Math.abs(d.zt)) > s.k
  }
  return { stats, disp }
}

/** Takes the departing readings out of their clusters; those of one cluster that admit each other stay together. */
export function splitDepartures(clusters, windows, opts = {}) {
  const { disp } = screen(clusters)
  const out = new Map(clusters.map((c, i) => [i, new Set()]))
  for (const d of disp) if (d.departs) out.get(d.ci).add(d.r.rid)
  const result = []
  const mk = rids => { const rs = rids.map(r => readingById.get(r)); const copies = COPIES.filter(c => rs.some(r => r.copy === c))
    return { key: rs[0].key, kind: rs[0].kind, copies, pattern: copies.join('+'), from: median(rs.map(r => r.from)), to: median(rs.map(r => r.to)), rids: [...rids].sort(), features: rs.map(r => r.fid).sort() } }
  clusters.forEach((c, i) => {
    const gone = [...out.get(i)]
    if (!gone.length) { result.push(c); return }
    const stay = c.rids.filter(r => !out.get(i).has(r))
    if (stay.length) result.push(mk(stay))
    // the departing readings: group those that admit each other pairwise (complete linkage), nearest first
    const groups = []
    for (const r of gone.sort()) {
      const x = readingById.get(r)
      const g = groups.find(g => g.every(o => { const m = measure(windows, x, readingById.get(o), opts); return m && m.w <= 1 }))
      if (g) g.push(r); else groups.push([r])
    }
    groups.forEach(g => result.push(mk(g)))
  })
  return result.sort((a, b) => a.from - b.from)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { clusters, windows } = blindCollation({ linkage: 'single' })
  const base = compare(clusters)
  const { stats, disp } = screen(clusters)
  console.table([...stats].map(([k, s]) => ({ copyGroup: k, n: s.n, k: s.k.toFixed(2), medFrom: s.mf.toFixed(2), sigFrom: s.sf.toFixed(2), medTo: s.mt.toFixed(2), sigTo: s.st.toFixed(2) })))
  // clusters that differ from the edition, and clusters the screen flags
  const differs = new Set()
  clusters.forEach((c, i) => { if (c.rids.some(r => { const s = edSymbolOfRid.get(r); return !s || base.status.get(s.id) !== 'exact' })) differs.add(i) })
  const flagged = new Set(disp.filter(d => d.departs).map(d => d.ci))
  const tp = [...flagged].filter(i => differs.has(i)).length
  console.log(`clusters differing from edition: ${differs.size}; flagged by screen: ${flagged.size}; both: ${tp}; flagged but agreeing with edition: ${flagged.size - tp}; differing but not flagged: ${differs.size - tp}`)
  const refined = splitDepartures(clusters, windows)
  const r2 = compare(refined)
  console.log(`after splitting departures: clusters ${refined.length}, exact ${r2.exact}/${r2.n} (${(100 * r2.exact / r2.n).toFixed(1)}%)`)
  console.table(r2.tallyKind)
  console.log('pairs onlyEd', r2.pairs.onlyEdition.length, 'onlyBlind', r2.pairs.onlyBlind.length)
}
