import { readFileSync } from 'node:fs'
import { featIdx } from './common.mjs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const symOf = new Map(M.symbols.flatMap(r => r.carrierDetail.map(c => [c.feature, r])))
const [copy, lo, hi, ...tracks] = process.argv.slice(2)
const T = tracks.map(Number)
for (const x of [...featIdx.values()].filter(x => (copy==='*'||x.copy === copy) && x.f.type==='HoleChain' && x.f.horizontal.from >= +lo && x.f.horizontal.from <= +hi && (!T.length || T.includes(x.f.vertical.from))).sort((a,b)=>a.f.horizontal.from-b.f.horizontal.from)) {
  const s = symOf.get(x.f.id)
  console.log(x.copy, x.f.horizontal.from.toFixed(1), x.f.horizontal.to.toFixed(1), 't'+x.f.vertical.from, s ? `${s.kind} ${s.insV}${s.delV.length?'>'+s.delV.join('/'):''} [${s.carriers.join('+')}] ${s.insEditType??''} ${s.insMotivation??''}` : '-')
}
