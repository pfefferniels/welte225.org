// Candidate split readings: same kind, near-identical place, disjoint carrier sets
import { readFileSync, writeFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const S = M.symbols.filter(r => r.from != null)
const TOL = +(process.argv[2] ?? 4)
const pairs = []
for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
  const a = S[i], b = S[j]
  if (b.from - a.from > TOL) break
  if (a.kind !== b.kind) continue
  if (a.carriers.some(c => b.carriers.includes(c))) continue
  pairs.push({ kind: a.kind, a: { from: a.from, to: a.to, v: a.insV + (a.delV.length ? '>' + a.delV.join('/') : ''), car: a.carriers.join('+'), et: a.insEditType, mot: a.insMotivation, delEt: a.deletions.map(d=>d.editType+'/'+d.motivation).join(',') }, b: { from: b.from, to: b.to, v: b.insV + (b.delV.length ? '>' + b.delV.join('/') : ''), car: b.carriers.join('+'), et: b.insEditType, mot: b.insMotivation, delEt: b.deletions.map(d=>d.editType+'/'+d.motivation).join(',') }, dFrom: +(b.from - a.from).toFixed(2), dTo: +(b.to - a.to).toFixed(2), union: [...new Set([...a.carriers, ...b.carriers])].length })
}
const sorted = pairs.sort((x, y) => x.a.from - y.a.from)
for (const p of sorted) console.log(`${p.kind.padEnd(28)} ${String(p.a.from).padStart(8)} dFrom ${String(p.dFrom).padStart(5)} dTo ${String(p.dTo).padStart(6)} | ${p.a.v} [${p.a.car}] ${p.a.et??''}/${p.a.mot??''} del:${p.a.delEt} | ${p.b.v} [${p.b.car}] ${p.b.et??''}/${p.b.mot??''} del:${p.b.delEt}`)
const g = {}; for (const p of pairs) { const k = [p.a.v.split('>')[0] + '[' + p.a.car + ']', p.b.v.split('>')[0] + '[' + p.b.car + ']'].sort().join(' ~ '); g[k] = (g[k] ?? 0) + 1 }
console.log(pairs.length, 'pairs within', TOL, 'mm'); console.log(g)
writeFileSync(new URL(`splits_${TOL}mm.json`, import.meta.url), JSON.stringify(sorted, null, 1))
