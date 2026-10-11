// Class (c): L1's 102 insertions / 80 deletions
import { readFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const byId = new Map(M.symbols.map(r => [r.id, r]))
const ins = M.symbols.filter(r => r.insV === 'L1'), del = M.symbols.filter(r => r.delV.includes('L1'))
const g = (arr, f) => { const o = {}; for (const x of arr) { const k = f(x); o[k] = (o[k] ?? 0) + 1 } return o }
console.log('L1 insertions', ins.length, g(ins, r => `${r.insShape} ${r.insEditType ?? '-'}/${r.insMotivation ?? '-'}`))
console.log('L1 insertions by kind', g(ins, r => r.type === 'note' ? 'note' : r.expressionType))
const dl = del.map(r => ({ r, d: r.deletions.find(d => d.v === 'L1') }))
console.log('L1 deletions', del.length, g(dl, x => `${x.d.shape} ${x.d.editType ?? '-'}/${x.d.motivation ?? '-'}`))
console.log('L1 deletions by inserting version', g(del, r => r.insV), 'by kind', g(del, r => r.type === 'note' ? 'note' : r.expressionType))
// replace pairs: deleted symbol vs inserted symbol of same kind in the same edit
const pairs = []
for (const { r, d } of dl) for (const id of d.replacedBy) { const x = byId.get(id); if (x.kind === r.kind) pairs.push({ et: d.editType ?? d.motivation, dFrom: +(x.from - r.from).toFixed(2), dTo: +(x.to - r.to).toFixed(2), at: r.from, kind: r.kind }) }
console.log('same-kind replace pairs', pairs.length)
for (const et of [...new Set(pairs.map(p => p.et))]) {
  const P = pairs.filter(p => p.et === et)
  const af = P.map(p => Math.abs(p.dFrom)).sort((a, b) => a - b), at = P.map(p => Math.abs(p.dTo)).sort((a, b) => a - b)
  console.log(`  ${et}: n=${P.length} |dFrom| median ${af[af.length >> 1]} min ${af[0]} max ${af.at(-1)} ; <=3.3mm: ${af.filter(x => x <= 3.3).length}, <=8mm: ${af.filter(x => x <= 8).length} ; |dTo| median ${at[at.length >> 1]}`)
}
console.log('shift pairs |dFrom| list:', pairs.filter(p => p.et === 'shift').map(p => p.dFrom).sort((a, b) => Math.abs(a) - Math.abs(b)).join(' '))
console.log('shift pairs by kind', g(pairs.filter(p => p.et === 'shift'), p => p.kind.startsWith('note') ? 'note' : p.kind))
// L1 vs the other Licensee copy L2 and against r3 consensus: onset differences of shared readings Ne1 vs St2 (systematic error estimate)
const sh = M.symbols.filter(r => r.carriers.includes('Ne1') && r.carriers.includes('St2'))
const dd = sh.map(r => { const a = r.carrierDetail.find(c => c.copy === 'Ne1'), b = r.carrierDetail.find(c => c.copy === 'St2'); return { e: r.type, d: a.from - b.from } })
for (const t of ['note', 'expression']) { const v = dd.filter(x => x.e === t).map(x => x.d).sort((a, b) => a - b); const med = v[v.length >> 1]; const mad = v.map(x => Math.abs(x - med)).sort((a, b) => a - b)[v.length >> 1]; console.log(`Ne1-St2 onset diff on shared ${t}s: n=${v.length} median ${med.toFixed(2)} MAD ${mad.toFixed(2)} p95|d-med| ${v.map(x => Math.abs(x - med)).sort((a, b) => a - b)[Math.floor(v.length * .95)].toFixed(2)}`) }
for (const c of ['Wi1', 'Ch1', 'St1']) { const v = M.symbols.filter(r => r.carriers.includes(c) && r.carriers.includes('St2') && r.type === 'expression').map(r => r.carrierDetail.find(x => x.copy === c).from - r.carrierDetail.find(x => x.copy === 'St2').from).sort((a, b) => a - b); const med = v[v.length >> 1]; console.log(`${c}-St2 expression onset: median ${med.toFixed(2)} MAD ${v.map(x => Math.abs(x - med)).sort((a, b) => a - b)[v.length >> 1].toFixed(2)}`) }
