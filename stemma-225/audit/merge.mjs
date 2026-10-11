// What if near-identical readings that the collation kept apart (same kind, disjoint carriers, onset and end within T mm) were one reading?
import { readFileSync } from 'node:fs'
import { infer } from './rule.mjs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const S = M.symbols.filter(r => r.from != null && r.insV !== 'G1').sort((a, b) => a.from - b.from)
for (const T of [4, 5, 8]) {
  const out = []
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length && S[j].from - S[i].from <= T; j++) {
    const a = S[i], b = S[j]
    if (a.kind !== b.kind || a.carriers.some(c => b.carriers.includes(c)) || Math.abs(b.to - a.to) > T) continue
    const u = [...new Set([...a.carriers, ...b.carriers])].sort((x, y) => M.copies.indexOf(x) - M.copies.indexOf(y))
    const g = infer(u)
    out.push(`${a.from} ${a.kind}: ${a.insV}[${a.carriers.join('+')}] + ${b.insV}[${b.carriers.join('+')}] dOn ${(b.from - a.from).toFixed(1)} dOff ${(b.to - a.to).toFixed(1)} → [${u.join('+')}] rule ${g.ins}${g.del.length ? '>' + g.del.join('/') : ''}${g.violations.length ? ' VIOLATION lacking ' + g.violations : ''}`)
  }
  console.log(`\nT=${T} mm: ${out.length} split candidates, ${out.filter(x => x.includes('VIOLATION')).length} Dollo violations after merging`)
  out.forEach(x => console.log('  ', x))
}
