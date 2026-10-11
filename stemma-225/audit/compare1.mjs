import { readFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const S = M.symbols
const byV = {}
for (const r of S) {
  const k = r.insV
  byV[k] ??= { n:0, exact:0, exactT:0, dev: {} }
  byV[k].n++
  if (r.carriers.join() === r.expected.join()) byV[k].exact++
  if (r.carriersT.join() === r.expectedT.join()) byV[k].exactT++
  else {
    const miss = r.expectedT.filter(c=>!r.carriersT.includes(c)), extra = r.carriersT.filter(c=>!r.expectedT.includes(c))
    const key = `${miss.length? '-'+miss.join('-'):''}${extra.length? ' +'+extra.join('+'):''}`
    byV[k].dev[key]=(byV[k].dev[key]??0)+1
  }
}
for (const [k,x] of Object.entries(byV)) console.log(k, 'n', x.n, 'exact(raw)', x.exact, 'exact(transfer)', x.exactT, JSON.stringify(x.dev))
// carrier pattern histogram
const pat = {}
for (const r of S) { const k = r.carriers.join('+')||'(none)'; pat[k] ??= {}; pat[k][r.insV+(r.delV.length?'>'+r.delV.join('/'):'')] = (pat[k][r.insV+(r.delV.length?'>'+r.delV.join('/'):'')]??0)+1 }
for (const [k,x] of Object.entries(pat).sort((a,b)=>Object.values(b[1]).reduce((s,y)=>s+y,0)-Object.values(a[1]).reduce((s,y)=>s+y,0))) console.log(k.padEnd(28), JSON.stringify(x))
