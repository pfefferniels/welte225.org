// Cross-system: does the library's substitutionsBetween, run on the transcriptions alone, find the green held
// commands that stand for the red latched pairs, as the edition's G1 recodings say?
import { writeFileSync } from 'node:fs'
import { LR, readings, readingById, edSymbols, edSymbolOfRid, ed, sig, COPIES } from './base.mjs'
import { blindCollation } from './blind.mjs'
const { clusters } = blindCollation({ linkage: 'single' })
const clusterOf = new Map(); clusters.forEach((c, i) => c.rids.forEach(r => clusterOf.set(r, i)))
const symOf = r => ({ ...r.sym, id: r.rid })
const locate = s => { const r = readingById.get(s.id); return { unit: 'mm', from: r.from, to: r.to } }
const green = readings.filter(r => r.copy === 'Bo1' && r.kind === 'expression').map(symOf)
// the edition's recodings
const g1 = ed.versions.find(v => sig.get(v.id) === 'G1')
const edSym = new Map(edSymbols.map(s => [s.id, s]))
const edLinks = g1.edits.filter(e => e.editType === 'recoding' && e.insert?.length && e.delete?.length).map(e => ({
  green: e.insert.flatMap(s => edSym.get(s.id).rids).sort().join(','),
  red: e.delete.map(id => edSym.get(id)).map(s => [...new Set(s.rids.map(r => clusterOf.get(r)))].join('/')).sort().join(' '),
  redSyms: e.delete.length, motivation: e.motivation }))
const edByGreen = new Map(edLinks.map(l => [l.green, l]))
console.log('edition recodings with both sides:', edLinks.length)
const result = {}
for (const tol of [3.5, 5, 8]) {
  const tolerance = { toleranceStart: tol, toleranceEnd: tol }
  const union = new Map()
  const rows = []
  for (const c of COPIES.filter(c => c !== 'Bo1')) {
    const red = readings.filter(r => r.copy === c && r.kind === 'expression').map(symOf)
    const subs = LR.substitutionsBetween(green, red, locate, tolerance)
    let agree = 0
    for (const s of subs) {
      const g = s.by.map(x => x.id).sort().join(',')
      const redc = s.replaced.map(x => clusterOf.get(x.id)).sort((a, b) => a - b).join(' ')
      const e = edByGreen.get(g)
      if (e && e.red.split(' ').map(Number).sort((a, b) => a - b).join(' ') === redc) agree++
      const k = g + '>' + redc; union.set(k, [...(union.get(k) ?? []), c])
    }
    rows.push({ copy: c, substitutions: subs.length, agreeWithEdition: agree })
  }
  // consensus: a green run linked to the same red clusters through any copy; conflicting links for one run?
  const byGreen = new Map(); for (const k of union.keys()) { const [g, r] = k.split('>'); (byGreen.get(g) ?? byGreen.set(g, []).get(g)).push(r) }
  const ambiguous = [...byGreen.values()].filter(v => v.length > 1).length
  let agree = 0
  for (const [g, rs] of byGreen) { const e = edByGreen.get(g); if (e && rs.length === 1 && e.red.split(' ').map(Number).sort((a, b) => a - b).join(' ') === rs[0]) agree++ }
  const missed = edLinks.filter(l => !byGreen.has(l.green)).length
  console.log(`\ntolerance ${tol} mm`); console.table(rows)
  console.log(`union over copies: ${byGreen.size} green runs linked, ${ambiguous} linked differently through different copies; agree with edition ${agree}/${edLinks.length}; edition links not found ${missed}`)
  result[tol] = { rows, linked: byGreen.size, ambiguous, agree, missed }
}
// green readings the edition recodes one-sidedly (t98-only commands, insert only) and red ones deleted one-sidedly
const oneSided = g1.edits.filter(e => e.editType === 'recoding' && (!e.insert?.length || !e.delete?.length))
console.log('\nedition one-sided recodings:', oneSided.filter(e => e.insert?.length).length, 'insert-only,', oneSided.filter(e => e.delete?.length).length, 'delete-only')
writeFileSync(new URL('out/green.json', import.meta.url), JSON.stringify(result, null, 1))
