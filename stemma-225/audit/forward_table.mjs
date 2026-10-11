// Step 4: forward check per version (insertions and deletions whose symbol shows exactly the expected carrier pattern)
import { readFileSync, writeFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const V = ['r1', 'R1.1', 'R2', 'r3', 'R4', 'L2', 'G1', 'L1']
const t = Object.fromEntries(V.map(v => [v, { ins: 0, insExact: 0, del: 0, delExact: 0, singleWitnessIns: 0 }]))
for (const r of M.symbols) {
  const ok = r.carriers.join() === r.expected.join()
  t[r.insV].ins++; if (ok) t[r.insV].insExact++
  if (r.carriers.length === 1) t[r.insV].singleWitnessIns++
  for (const d of r.delV) { t[d].del++; if (ok) t[d].delExact++ }
}
console.log('version  ins exact | del exact | ins carried by one copy only')
for (const v of V) console.log(v.padEnd(6), `${t[v].insExact}/${t[v].ins}`.padStart(9), `${t[v].delExact}/${t[v].del}`.padStart(9), String(t[v].singleWitnessIns).padStart(6))
writeFileSync(new URL('forward_table.json', import.meta.url), JSON.stringify(t, null, 1))
