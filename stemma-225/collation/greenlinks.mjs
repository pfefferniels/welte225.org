// Bo1's presence on red expression clusters: a green held run that substitutionsBetween (5 mm) pairs with a red
// latched On/Off pair through any red or Licensee copy marks both clusters as recoded in Bo1.
import { LR, readings, readingById, COPIES } from './base.mjs'
const symOf = x => ({ ...x.sym, id: x.rid })
const locate = s => { const x = readingById.get(s.id); return { unit: 'mm', from: x.from, to: x.to } }
export function withGreen(clusters, tol = 5) {
  const clusterOf = new Map(); clusters.forEach((c, i) => c.rids.forEach(r => clusterOf.set(r, i)))
  const green = readings.filter(x => x.copy === 'Bo1' && x.kind === 'expression').map(symOf)
  const linked = new Set()
  for (const c of COPIES.filter(c => c !== 'Bo1')) {
    const red = readings.filter(x => x.copy === c && x.kind === 'expression').map(symOf)
    for (const s of LR.substitutionsBetween(green, red, locate, { toleranceStart: tol, toleranceEnd: tol })) s.replaced.forEach(x => linked.add(clusterOf.get(x.id)))
  }
  return clusters.filter(c => !(c.kind === 'expression' && c.copies.includes('Bo1')))
    .map((c, i) => ({ kind: c.kind, copies: linked.has(clusters.indexOf(c)) ? [...c.copies, 'Bo1'] : c.copies }))
}
