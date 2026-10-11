// Compare a blind partition of the readings with the edition's (each edition symbol = a set of readings).
import { readings, readingById, edSymbols, edSymbolOfRid, COPIES } from './base.mjs'

export const classOf = s => s.kind === 'note' ? 'note' : (s.copies.length === 1 && s.copies[0] === 'Bo1' ? 'green expr' : 'red/Lic expr')

export function compare(clusters) {
  const clusterOf = new Map()
  clusters.forEach((c, i) => c.rids.forEach(r => clusterOf.set(r, i)))
  const status = new Map()
  for (const s of edSymbols) {
    if (s.rids.some(r => !clusterOf.has(r))) { status.set(s.id, 'dropped'); continue }
    const cs = [...new Set(s.rids.map(r => clusterOf.get(r)))]
    const split = cs.length > 1
    const extra = cs.some(i => clusters[i].rids.some(r => edSymbolOfRid.get(r) !== s))
    status.set(s.id, split && extra ? 'split+merge' : split ? 'split' : extra ? 'merge' : 'exact')
  }
  const tally = (f) => { const t = {}; for (const s of edSymbols) { const k = f(s); t[k] ??= { n: 0, exact: 0, split: 0, merge: 0, 'split+merge': 0, dropped: 0 }; t[k].n++; t[k][status.get(s.id)]++ } return t }
  // per copy: share of the copy's readings whose blind cluster-mates are exactly its edition symbol-mates
  const perCopy = {}
  for (const c of COPIES) {
    const rs = readings.filter(r => r.copy === c)
    let same = 0
    for (const r of rs) {
      const s = edSymbolOfRid.get(r.rid), cl = clusters[clusterOf.get(r.rid)]
      const ed = new Set(s ? s.rids.filter(x => clusterOf.has(x)) : [r.rid])
      if (cl.rids.length === ed.size && cl.rids.every(x => ed.has(x))) same++
    }
    perCopy[c] = { readings: rs.length, sameGrouping: same, pct: (100 * same / rs.length).toFixed(1) }
  }
  // pair level: (reading, reading) of different copies together in the edition and/or in the blind collation
  const edPairs = new Set(), blPairs = new Set()
  const pk = (a, b) => a < b ? a + '~' + b : b + '~' + a
  for (const s of edSymbols) { const rr = s.rids.filter(x => clusterOf.has(x)); for (let i = 0; i < rr.length; i++) for (let j = i + 1; j < rr.length; j++) edPairs.add(pk(rr[i], rr[j])) }
  for (const c of clusters) for (let i = 0; i < c.rids.length; i++) for (let j = i + 1; j < c.rids.length; j++) blPairs.add(pk(c.rids[i], c.rids[j]))
  const onlyEd = [...edPairs].filter(p => !blPairs.has(p)), onlyBl = [...blPairs].filter(p => !edPairs.has(p))
  const byCopyPair = (ps) => { const t = {}; for (const p of ps) { const [a, b] = p.split('~').map(r => readingById.get(r).copy).sort((x, y) => COPIES.indexOf(x) - COPIES.indexOf(y)); t[a + '-' + b] = (t[a + '-' + b] ?? 0) + 1 } return t }
  const exact = [...status.values()].filter(x => x === 'exact').length
  return { status, clusterOf, exact, n: edSymbols.length, tallyKind: tally(classOf), tallyVersion: tally(s => s.version), perCopy,
    pairs: { edition: edPairs.size, blind: blPairs.size, common: edPairs.size - onlyEd.length, onlyEdition: onlyEd, onlyBlind: onlyBl,
      onlyEdByCopyPair: byCopyPair(onlyEd), onlyBlByCopyPair: byCopyPair(onlyBl) } }
}
