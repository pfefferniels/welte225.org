// Class (a): symbols carried by Wi1 alone: R1.1 insertions vs r1 readings struck/moved by R2
import { readFileSync, writeFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const byId = new Map(M.symbols.map(r => [r.id, r]))
const W = M.symbols.filter(r => r.carriers.join() === 'Wi1')
// latched state machine for redundancy (T-100 vocabulary)
const pairOf = k => { const m = k.match(/^expr:(\w+?)(On|Off)\/(\w+)$/); return m ? { fn: m[1] + '/' + m[3], on: m[2] === 'On' } : null }
function redundantIn(textIds, id) {
  const r = byId.get(id); const p = pairOf(r.kind); if (!p) return null
  const seq = textIds.map(i => byId.get(i)).filter(x => pairOf(x.kind)?.fn === p.fn).sort((a, b) => a.from - b.from)
  let state = false // off at start
  for (const x of seq) { const q = pairOf(x.kind); if (x.id === id) return state === q.on; state = q.on }
  return null
}
const text = v => { // snapshot of a version from matrix: ins at ancestor, not deleted by ancestor
  const anc = []; let n = v; while (n) { anc.push(n); n = M.parentOf[n] }
  return M.symbols.filter(r => anc.includes(r.insV) && !r.delV.some(d => anc.includes(d))).map(r => r.id)
}
const tR11 = text('R1.1'), tR2 = text('R2'), tr1 = text('r1')
const rows = []
for (const r of W.sort((a, b) => a.from - b.from)) {
  const dels = r.deletions.filter(d => d.v === 'R2')
  const repl = dels.flatMap(d => d.replacedBy).map(id => byId.get(id))
  // nearest same-kind symbol in R2's text (St1) that Wi1 lacks
  const nb = tR2.map(i => byId.get(i)).filter(x => x.kind === r.kind && !x.carriers.includes('Wi1')).map(x => ({ x, d: x.from - r.from })).sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0]
  const red = redundantIn(r.insV === 'R1.1' ? tR11 : tr1, r.id)
  rows.push({ from: r.from, kind: r.kind, editor: r.insV === 'R1.1' ? 'R1.1 ins' : 'r1, R2 del', editType: r.insV === 'R1.1' ? r.insEditType : dels[0]?.editType, motivation: r.insV === 'R1.1' ? r.insMotivation : dels[0]?.motivation, shape: r.insV === 'R1.1' ? r.insShape : dels[0]?.shape,
    replacement: repl.map(x => `${x.kind}@${x.from}`).join(' '), replDelta: repl.length ? +(repl[0].from - r.from).toFixed(1) : null, sameKindReplacement: repl.some(x => x.kind === r.kind),
    nearestSameKindInR2notWi1: nb ? +nb.d.toFixed(1) : null, redundantInOwnText: red })
}
for (const x of rows) console.log(JSON.stringify(x))
writeFileSync(new URL('wi1only.json', import.meta.url), JSON.stringify(rows, null, 1))
// summaries
const g = (f) => { const o = {}; for (const x of rows) { const k = f(x); o[k] = (o[k] ?? 0) + 1 } return o }
console.log(g(x => `${x.editor} | ${x.shape} ${x.editType ?? '-'}`))
console.log('replace with same kind:', g(x => `${x.editor} | sameKindRepl=${x.sameKindReplacement}`))
console.log('nearest same-kind non-Wi1 reading in R2 within 30mm:', g(x => `${x.editor} | ${x.nearestSameKindInR2notWi1 != null && Math.abs(x.nearestSameKindInR2notWi1) <= 30}`))
console.log('redundant in own text:', g(x => `${x.editor} | ${x.redundantInOwnText}`))
console.log('kind:', g(x => `${x.editor} | ${x.kind.startsWith('note') ? 'note' : x.kind}`))
