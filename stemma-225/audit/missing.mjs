// Step 2: where can each copy testify? scan/content range, tears, later modifications
import { readFileSync, writeFileSync } from 'node:fs'
import { ed, LR, featIdx, COPIES } from './common.mjs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const carried = new Set(M.symbols.flatMap(r => r.carrierDetail.map(c => c.feature)))
const cov = {}
for (const c of COPIES) {
  const fs = [...featIdx.values()].filter(x => x.copy === c && x.f.type === 'HoleChain')
  const prod = fs.filter(x => x.act === 'production')
  const content = prod.filter(x => carried.has(x.f.id)).map(x => x.f.horizontal)
  const copy = ed.copies.find(x => x.siglum === c)
  cov[c] = {
    chains: fs.length, carrying: fs.filter(x => carried.has(x.f.id)).length,
    firstChain: +Math.min(...fs.map(x => x.f.horizontal.from)).toFixed(1), lastChain: +Math.max(...fs.map(x => x.f.horizontal.to)).toFixed(1),
    contentFrom: +Math.min(...content.map(h => h.from)).toFixed(1), contentTo: +Math.max(...content.map(h => h.to)).toFixed(1),
    uncarried: fs.filter(x => !carried.has(x.f.id)).map(x => `${x.f.horizontal.from.toFixed(0)}t${x.f.vertical.from}${x.act !== 'production' ? '[' + x.act + ']' : ''}`).slice(0, 12),
    laterFeaturesCarrying: fs.filter(x => x.act !== 'production' && carried.has(x.f.id)).map(x => `${x.f.horizontal.from.toFixed(0)}t${x.f.vertical.from}[${x.act}]`),
    tears: LR.tearsOf(copy).map(t => ({ from: +t.horizontal.from.toFixed(1), to: +t.horizontal.to.toFixed(1), edge: t.edge, depth: +t.depth?.value?.toFixed(1) })),
    mods: copy.modifications.map(m => `${m.type}:${m.purpose}:${LR.featuresMadeBy(m).length}`),
  }
}
console.log(JSON.stringify(cov, null, 1))
const lo = Math.max(...COPIES.map(c => cov[c].contentFrom)), hi = Math.min(...COPIES.map(c => cov[c].contentTo))
console.log('common content range', lo, hi)
// symbols outside any copy's content range
for (const c of COPIES) {
  const out = M.symbols.filter(r => r.from != null && (r.to < cov[c].contentFrom - 5 || r.from > cov[c].contentTo + 5))
  console.log(c, 'symbols outside its content range:', out.length, out.map(r => `${r.from}:${r.kind}:${r.insV}:${r.carriers.join('+')}${r.carriers.includes(c) ? '' : ' (absent;expected=' + r.expected.includes(c) + ')'}`).join(' ; '))
}
// St2 tears: symbols within +-3 mm of a tear span, on outermost tracks
const st2 = cov.St2.tears
for (const t of st2) {
  const near = M.symbols.filter(r => r.from != null && r.to >= t.from - 3 && r.from <= t.to + 3)
  const cand = near.filter(r => { const tr = r.carrierDetail.map(c => c.track).filter(x => x != null); const m = tr.length ? Math.max(...tr) : 0, n = tr.length ? Math.min(...tr) : 100; return t.edge === 'bass' ? n <= 10 : m >= 88 })
  console.log('tear', JSON.stringify(t), 'edge-region symbols nearby:', cand.map(r => `${r.from}:${r.kind}:${r.insV}${r.delV.length ? '>' + r.delV.join('/') : ''}:[${r.carriers.join('+')}]St2:${r.carriers.includes('St2') ? 'Y' : 'N'}`).join(' ; ') || '-')
}
writeFileSync(new URL('coverage.json', import.meta.url), JSON.stringify({ coverage: cov, commonContent: [lo, hi] }, null, 1))
