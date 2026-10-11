// (b) Is St1 = R2 (ancestor of r3), or a copy on its own branch beside r3? Compare Dollo event counts on both topologies.
import { readFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
function makeInfer(parentOf, fh) {
  const nodes = Object.keys(parentOf)
  const children = n => nodes.filter(c => parentOf[c] === n)
  const anc = n => { const o = []; while (n) { o.push(n); n = parentOf[n] } return o }
  const sub = n => [n, ...children(n).flatMap(sub)]
  const copyAt = Object.fromEntries(Object.entries(fh).map(([c, v]) => [v, c]))
  const hasCopy = n => sub(n).some(x => copyAt[x])
  return carriers => {
    const P = carriers.map(c => fh[c]); const as = P.map(anc); const ins = as[0].find(a => as.every(x => x.includes(a)))
    const present = new Set(P.flatMap(p => { const a = anc(p); return a.slice(0, a.indexOf(ins) + 1) }))
    const viol = [...present].filter(n => copyAt[n] && !carriers.includes(copyAt[n])).length
    const del = []; const walk = n => { for (const c of children(n)) { if (present.has(c)) walk(c); else if (hasCopy(c)) del.push(c) } }; walk(ins)
    return { ins, del, viol, cost: 1 + del.length + viol }
  }
}
const A = makeInfer(M.parentOf, M.firstHand)
const pB = { ...M.parentOf, St1leaf: 'R2' }, fhB = { ...M.firstHand, St1: 'St1leaf' }
const B = makeInfer(pB, fhB)
let cA = 0, cB = 0; const diff = []
for (const r of M.symbols) { const a = A(r.carriers), b = B(r.carriers); cA += a.cost; cB += b.cost; if (a.cost !== b.cost || a.ins !== b.ins) diff.push(`${r.from} ${r.kind} [${r.carriers.join('+')}] editor ${r.insV}>${r.delV.join('/')} | A ${a.ins}>${a.del.join('/')} cost ${a.cost}${a.viol ? ' viol' : ''} | B ${b.ins}>${b.del.join('/')} cost ${b.cost}`) }
console.log('total Dollo events: A (St1 = R2, editor)', cA, ' B (St1 on own branch from R2)', cB)
diff.forEach(d => console.log('  ', d))
