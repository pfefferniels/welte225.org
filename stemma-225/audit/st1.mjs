import { readFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const byId = new Map(M.symbols.map(r => [r.id, r]))
const fmt = r => `${r.from}-${r.to} ${r.kind} ${r.insV}${r.delV.length ? '>' + r.delV.join('/') : ''} [${r.carriers.join('+')}] ins:${r.insShape} ${r.insEditType ?? ''}/${r.insMotivation ?? ''} del:${r.deletions.map(d => d.v + ':' + d.shape + ' ' + (d.editType ?? '') + '/' + (d.motivation ?? '') + (d.replacedBy.length ? '→' + d.replacedBy.map(i => { const x = byId.get(i); return `${x.from}-${x.to}[${x.carriers.join('+')}]` }).join(',') : '')).join(' ; ')}`
for (const pat of ['St1', 'St1+Wi1', 'St1+Ne1', 'St1+Wi1+Ne1']) {
  console.log(`\n== pattern {${pat}}`)
  for (const r of M.symbols.filter(r => r.carriers.join('+') === pat)) console.log('  ', fmt(r))
}
console.log('\n== r3 insertions')
for (const r of M.symbols.filter(r => r.insV === 'r3')) console.log('  ', fmt(r))
console.log('\n== r3 deletion')
for (const r of M.symbols.filter(r => r.delV.includes('r3'))) console.log('  ', fmt(r))
console.log('\n== R4 deletions')
for (const r of M.symbols.filter(r => r.delV.includes('R4'))) console.log('  ', fmt(r))
