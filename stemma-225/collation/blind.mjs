// Blind collation: from the six copies' readings alone, deterministic and independent of copy order.
import { LR, readings, COPIES, groupOfKey } from './base.mjs'

const groupBy = (xs, f) => { const m = new Map(); for (const x of xs) { const k = f(x); (m.get(k) ?? m.set(k, []).get(k)).push(x) } return m }
export const byKey = groupBy(readings, r => r.key)
const ORDER = process.env.COPY_ORDER ? process.env.COPY_ORDER.split(',') : COPIES
const ci = Object.fromEntries(ORDER.map((c, i) => [c, i]))
const pairKey = (a, b, group) => `${a}|${b}|${group}`

/**
 * Pass 0: how far each pair of copies disagrees. For every key, mutual nearest onsets within W0 mm are taken as
 * provisional matches; their displacements (later copy in COPIES order minus earlier) give per pair and per group
 * (note / expression) a median and a MAD-sigma, and the window is departureThreshold(n) * sigma about the median,
 * exactly as scatter.ts computes a derivation's tolerance.
 */
export function pairWindows(W0 = 8) {
  const samples = new Map()
  for (const [key, rs] of byKey) {
    const group = groupOfKey(key)
    const byCopy = groupBy(rs, r => r.copy)
    for (let i = 0; i < ORDER.length; i++) for (let j = i + 1; j < ORDER.length; j++) {
      const A = byCopy.get(ORDER[i]) ?? [], B = byCopy.get(ORDER[j]) ?? []
      if (!A.length || !B.length) continue
      const nearest = (x, Ys) => { let best, bd = Infinity; for (const y of Ys) { const d = Math.abs(y.from - x.from); if (d < bd || (d === bd && y.rid < best.rid)) { bd = d; best = y } } return bd <= W0 ? best : undefined }
      for (const a of A) {
        const b = nearest(a, B); if (!b || nearest(b, A) !== a) continue
        const k = pairKey(ORDER[i], ORDER[j], group)
        ;(samples.get(k) ?? samples.set(k, { from: [], to: [] }).get(k)).from.push(b.from - a.from)
        samples.get(k).to.push(b.to - a.to)
      }
    }
  }
  const windows = new Map()
  for (const [k, s] of samples) {
    const sf = LR.spreadOf(s.from), st = LR.spreadOf(s.to), kk = LR.departureThreshold(s.from.length)
    windows.set(k, { n: s.from.length, k: kk, offsetStart: sf.median, offsetEnd: st.median, sigmaStart: sf.sigma, sigmaEnd: st.sigma,
      toleranceStart: kk * sf.sigma, toleranceEnd: kk * st.sigma })
  }
  return windows
}

/** The window between two readings' copies, oriented so that the displacement is y - x. */
const windowFor = (windows, x, y, opts) => {
  const [a, b] = ci[x.copy] < ci[y.copy] ? [x, y] : [y, x]
  const w = windows.get(pairKey(a.copy, b.copy, groupOfKey(x.key)))
  if (!w) return undefined
  const sign = a === x ? 1 : -1
  const tS = opts.fixed ?? w.toleranceStart * (opts.scale ?? 1), tE = opts.fixed ?? w.toleranceEnd * (opts.scale ?? 1)
  const oS = opts.centred === false ? 0 : sign * w.offsetStart, oE = opts.centred === false ? 0 : sign * w.offsetEnd
  return { tS, tE, oS, oE }
}

/** How far apart two readings lie in units of their pair's window: <= 1 is admitted. Also the two ends apart. */
export function measure(windows, x, y, opts = {}) {
  const w = windowFor(windows, x, y, opts)
  if (!w) return undefined
  const s = Math.abs(y.from - x.from - w.oS) / w.tS
  const e = Math.abs(y.to - x.to - w.oE) / w.tE
  return { s, e, w: opts.onsetOnly ? s : Math.max(s, e), dS: y.from - x.from, dE: y.to - x.to, win: w }
}

/** All admitted edges: same key, different copies, within the pair's window at both ends (or the onset only). */
export function edgesOf(windows, opts = {}) {
  const edges = []
  for (const [key, rs] of byKey) {
    const sorted = [...rs].sort((a, b) => a.from - b.from)
    const reach = 40 // mm; far beyond any window used here
    for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length && sorted[j].from - sorted[i].from <= reach; j++) {
      const x = sorted[i], y = sorted[j]
      if (x.copy === y.copy) continue
      const m = measure(windows, x, y, opts)
      if (m && m.w <= 1 + 1e-9) {
        const [p, q] = x.rid < y.rid ? [x, y] : [y, x]
        edges.push({ x: p, y: q, w: m.w })
      }
    }
  }
  // A total order that names no copy first: by distance, ties by the reading ids.
  return edges.sort((a, b) => a.w - b.w || (a.x.rid < b.x.rid ? -1 : a.x.rid > b.x.rid ? 1 : a.y.rid < b.y.rid ? -1 : a.y.rid > b.y.rid ? 1 : 0))
}

/**
 * Clusters: Kruskal over the edges, nearest first, joining two clusters only where no copy would read the
 * cluster twice. linkage 'single' joins on any admitted edge; 'complete' only where every cross pair is admitted.
 */
export function cluster(input, edges, linkage = 'single') {
  const parent = new Map(input.map(r => [r.rid, r.rid]))
  const members = new Map(input.map(r => [r.rid, [r]]))
  const find = r => { while (parent.get(r) !== r) { parent.set(r, parent.get(parent.get(r))); r = parent.get(r) } return r }
  const edgeSet = linkage !== 'single' ? new Set(edges.map(e => e.x.rid + '~' + e.y.rid)) : undefined
  const share = linkage === 'complete' ? 1 : linkage === 'average' ? 0.5 : 0
  const admitted = (p, q) => edgeSet.has(p.rid < q.rid ? p.rid + '~' + q.rid : q.rid + '~' + p.rid)
  for (const { x, y } of edges) {
    const a = find(x.rid), b = find(y.rid)
    if (a === b) continue
    const A = members.get(a), B = members.get(b)
    const ca = new Set(A.map(r => r.copy))
    if (B.some(r => ca.has(r.copy))) continue
    if (edgeSet) { let yes = 0; for (const p of A) for (const q of B) if (admitted(p, q)) yes++; if (yes < share * A.length * B.length - 1e-9) continue }
    const [root, child] = a < b ? [a, b] : [b, a]
    parent.set(child, root); members.set(root, [...members.get(root), ...members.get(child)]); members.delete(child)
  }
  const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
  return [...members.values()].map(rs => {
    const copies = COPIES.filter(c => rs.some(r => r.copy === c))
    return { key: rs[0].key, kind: rs[0].kind, copies, pattern: copies.join('+'), from: median(rs.map(r => r.from)), to: median(rs.map(r => r.to)),
      rids: rs.map(r => r.rid).sort(), features: rs.map(r => r.fid).sort() }
  }).sort((a, b) => a.from - b.from || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || (a.rids[0] < b.rids[0] ? -1 : 1))
}

export function blindCollation(opts = {}) {
  const windows = opts.windows ?? pairWindows(opts.W0 ?? 8)
  const edges = edgesOf(windows, opts)
  return { windows, clusters: cluster(opts.input ?? readings, edges, opts.linkage ?? 'single'), edges }
}
