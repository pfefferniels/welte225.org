// For each pair of edition symbols the blind collation joins: would the edition's own stored window of the
// derivation that separates them (the younger symbol's version against its principal parent) have joined them?
import { LR, readingById, edSymbolOfRid, ed, sig } from './base.mjs'
import { blindCollation } from './blind.mjs'
const { clusters } = blindCollation({ linkage: 'single' })
const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const vById = new Map(ed.versions.map(v => [sig.get(v.id), v]))
const depth = s => { let d = 0, v = vById.get(s); while (v && v.basedOn?.length) { v = vById.get(sig.get(LR.idOf(LR.principalDerivationOf(v)))); d++ } return d }
const rows = []
for (const c of clusters) {
  const eds = [...new Set(c.rids.map(x => edSymbolOfRid.get(x)).filter(Boolean))]
  if (eds.length !== 2) continue
  const [A, B] = [...eds].sort((a, b) => depth(a.version) - depth(b.version))
  const v = vById.get(B.version), der = LR.principalDerivationOf(v)
  const tol = der?.collationTolerance ?? LR.defaultCollationTolerance
  const pa = A.rids.map(x => readingById.get(x)), pb = B.rids.map(x => readingById.get(x))
  const disp = { from: median(pb.map(x => x.from)) - median(pa.map(x => x.from)), to: median(pb.map(x => x.to)) - median(pa.map(x => x.to)) }
  const ends = LR.admittedAtEnds(tol, disp)
  rows.push({ at: c.from.toFixed(0), key: c.key.replace('expression ', ''), older: `${A.version}:${A.copies.join('+')}`, younger: `${B.version}:${B.copies.join('+')}`,
    edge: `${B.version}<-${sig.get(LR.idOf(der))}`, window: `${(tol.offsetStart ?? 0).toFixed(1)}±${tol.toleranceStart.toFixed(1)}/${(tol.offsetEnd ?? 0).toFixed(1)}±${tol.toleranceEnd.toFixed(1)}`,
    disp: `${disp.from.toFixed(1)}/${disp.to.toFixed(1)}`, storedJoins: ends.from && ends.to ? 'yes' : `no (${!ends.from ? 'onset' : ''}${!ends.from && !ends.to ? '+' : ''}${!ends.to ? 'end' : ''})` })
}
console.table(rows)
const t = {}; for (const r of rows) t[r.storedJoins.startsWith('yes') ? 'stored window joins' : r.storedJoins] = (t[r.storedJoins.startsWith('yes') ? 'stored window joins' : r.storedJoins] ?? 0) + 1
console.log(t)
