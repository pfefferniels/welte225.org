import { readFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const map = { SlowCrescendo: ['Crescendo'], Forzando: ['SforzandoForte', 'SforzandoPiano'], SustainPedal: ['SustainPedal'], SoftPedal: ['SoftPedal'], Mezzoforte: ['Mezzoforte'] }
const green = M.symbols.filter(r => r.insV === 'G1' && r.type === 'expression')
const red0 = M.symbols.filter(r => r.deletions.some(d => d.v === 'G1' && d.shape === '0i/1d' && d.editType === 'recoding'))
let hit = 0; const miss = []
for (const r of red0) {
  const fn = r.expressionType.replace(/(On|Off)$/, '')
  const cands = green.filter(g => (map[fn] ?? []).includes(g.expressionType) && g.scope === r.scope && Math.abs(g.from - r.from) <= 15 || (map[fn] ?? []).includes(g.expressionType) && g.scope === r.scope && g.from <= r.from && g.to >= r.from - 3)
  if (cands.length) hit++; else miss.push(`${r.from} ${r.kind} ${r.insV}`)
}
console.log(`0i/1d recoding deletions: ${red0.length}; with a green same-function command (same scope) within 15 mm or spanning it: ${hit}`)
console.log('without:', miss.join(' ; '))
