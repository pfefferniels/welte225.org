import { readings, edSymbolOfRid, COPIES } from './base.mjs'
for (const c of COPIES) {
  const rs = readings.filter(r => r.copy === c).sort((a, b) => a.from - b.from)
  const firstNote = rs.find(r => r.kind === 'note').from
  const lastNote = Math.max(...rs.filter(r => r.kind === 'note').map(r => r.to))
  console.log(c, 'first note', firstNote.toFixed(1), 'last note end', lastNote.toFixed(1))
  for (const r of rs.filter(r => r.from < firstNote + 5 || r.from > lastNote - 5 || /Rewind|Motor|Cut/.test(r.key))) console.log('   ', r.key.padEnd(36), r.from.toFixed(1), r.to.toFixed(1), edSymbolOfRid.has(r.rid) ? 'carried' : 'UNCARRIED')
}
