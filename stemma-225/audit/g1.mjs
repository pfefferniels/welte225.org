import { readFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const byId = new Map(M.symbols.map(r => [r.id, r]))
const g = (arr, f) => { const o = {}; for (const x of arr) { const k = f(x); o[k] = (o[k] ?? 0) + 1 } return o }
const delG = M.symbols.filter(r => r.delV.includes('G1'))
const d = delG.map(r => ({ r, e: r.deletions.find(x => x.v === 'G1') }))
console.log('G1 deletions', d.length, g(d, x => `${x.e.shape} ${x.e.editType}/${x.e.motivation}`))
console.log('G1 pure deletions by kind', g(d.filter(x => !x.e.replacedBy.length), x => x.r.kind))
const ins = M.symbols.filter(r => r.insV === 'G1')
console.log('G1 insertions w/o deletion by kind', g(ins.filter(r => !r.insReplace), r => `${r.kind} ${r.insEditType}/${r.insMotivation}`))
const dist = d.filter(x => x.e.replacedBy.length).map(x => Math.abs(byId.get(x.e.replacedBy[0]).from - x.r.from)).sort((a, b) => a - b)
console.log('recoded red symbol -> green replacement onset distance: median', dist[dist.length >> 1].toFixed(1), 'p90', dist[Math.floor(dist.length * .9)].toFixed(1), 'max', dist.at(-1).toFixed(1))
console.log('R4 insertions with Bo1 (raw)', M.symbols.filter(r => r.insV === 'R4' && r.carriers.includes('Bo1')).length, 'with Bo1 via transfer', M.symbols.filter(r => r.insV === 'R4' && r.carriersT.includes('Bo1')).length, '/', M.symbols.filter(r => r.insV === 'R4').length)
console.log('R4 insertions lacking Bo1 even via transfer:', M.symbols.filter(r => r.insV === 'R4' && !r.carriersT.includes('Bo1')).map(r => `${r.from} ${r.kind} del ${r.deletions.map(x => x.v + ':' + x.shape + ' ' + x.editType + '/' + x.motivation)}`))
