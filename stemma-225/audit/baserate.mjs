import { readFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const text = v => { const anc = []; let n = v; while (n) { anc.push(n); n = M.parentOf[n] } return M.symbols.filter(r => anc.includes(r.insV) && !r.delV.some(d => anc.includes(d))) }
const tR2 = text('R2'), tR11 = text('R1.1')
// for every symbol of R1.1's text (Wi1) of expression kind: does a same-kind symbol of R2's text lacking Wi1 lie within D mm?
for (const D of [30, 60]) {
  const shared = tR11.filter(x => x.type === 'expression' && x.carriers.length > 1)
  const hit = shared.filter(x => tR2.some(y => y.kind === x.kind && !y.carriers.includes('Wi1') && Math.abs(y.from - x.from) <= D))
  console.log(`D=${D}: shared (non-Wi1-only) expression readings of Wi1 with a same-kind non-Wi1 R2 reading within D: ${hit.length}/${shared.length}`)
}
