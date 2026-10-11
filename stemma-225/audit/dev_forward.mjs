import { readFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const byId = new Map(M.symbols.map(r => [r.id, r]))
for (const r of M.symbols.filter(r => r.carriers.join() !== r.expected.join())) {
  console.log(JSON.stringify({ id: r.id, kind: r.kind, from: r.from, to: r.to, insV: r.insV, del: r.deletions, carriers: r.carrierDetail.map(c => `${c.copy}@${c.from}-${c.to}t${c.track}`), expected: r.expected }, null, 0))
  // neighbours of same kind within 60mm
  const nb = M.symbols.filter(x => x.kind === r.kind && x.id !== r.id && Math.abs(x.from - r.from) < 60)
  for (const x of nb) console.log('   nb', x.kind, x.from, x.to, x.insV, x.delV.join('/'), x.carriers.join('+'), x.insEditType, x.insMotivation)
  for (const d of r.deletions) for (const rid of d.replacedBy) { const x = byId.get(rid); console.log('   replacedBy', d.v, x.kind, x.from, x.carriers.join('+')) }
}
// G1 handling of the first SoftPedalOn
const sp = M.symbols.find(r => r.from === 1345.82)
console.log(sp.deletions.map(d => JSON.stringify(d)), sp.deletions.flatMap(d=>d.replacedBy).map(id => { const x = byId.get(id); return `${x.kind}@${x.from}-${x.to}:${x.carriers}` }))
