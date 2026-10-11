// Per-version agreement of the pattern->version rule with the editor (symbol level), raw and transfer views; plus Dollo violations
import { readFileSync, writeFileSync } from 'node:fs'
import { infer } from './rule.mjs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const V = ['r1', 'R1.1', 'R2', 'r3', 'R4', 'L2', 'G1', 'L1']
const table = {}
for (const view of ['raw', 'transfer']) {
  const t = Object.fromEntries(V.map(v => [v, { insE: 0, insR: 0, insBoth: 0, delE: 0, delR: 0, delBoth: 0 }]))
  const viol = []
  for (const r of M.symbols) {
    if (view === 'transfer' && r.isGreenTransfer) continue
    const car = view === 'raw' ? r.carriers : r.carriersT
    const delE = (view === 'raw' ? r.delV : r.delVT).filter(d => d !== 'r5')
    const g = infer(car)
    t[r.insV].insE++; t[g.ins].insR++; if (g.ins === r.insV) t[r.insV].insBoth++
    for (const d of delE) { t[d].delE++; if (g.del.includes(d)) t[d].delBoth++ }
    for (const d of g.del) t[d].delR++
    if (g.violations.length && view === 'raw') viol.push(`${r.from} ${r.kind} [${car.join('+')}] editor ${r.insV}>${delE.join('/')} lacking: ${g.violations}`)
  }
  table[view] = t
  console.log(`\n${view}: version  ins(editor/rule/agree)  del(editor/rule/agree)`)
  for (const v of V) { const x = t[v]; console.log(`  ${v.padEnd(5)} ${String(x.insE).padStart(4)} ${String(x.insR).padStart(4)} ${String(x.insBoth).padStart(4)}    ${String(x.delE).padStart(4)} ${String(x.delR).padStart(4)} ${String(x.delBoth).padStart(4)}`) }
  const sum = k => V.reduce((s, v) => s + t[v][k], 0)
  console.log(`  total ins agree ${sum('insBoth')}/${sum('insE')}, del agree ${sum('delBoth')}/${sum('delE')} (rule proposes ${sum('delR')})`)
  if (view === 'raw') console.log('Dollo violations (copy lacks a reading although it lies between the insertion and a carrier):', viol)
}
writeFileSync(new URL('rule_stats.json', import.meta.url), JSON.stringify(table, null, 1))
