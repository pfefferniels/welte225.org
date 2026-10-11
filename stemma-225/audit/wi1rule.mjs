// Can the editor's split of Wi1-only readings (12 R1.1 insertions vs 59 r1 readings struck/moved by R2) be made mechanically?
import { readFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const byId = new Map(M.symbols.map(r => [r.id, r]))
const text = v => { const anc = []; let n = v; while (n) { anc.push(n); n = M.parentOf[n] } return M.symbols.filter(r => anc.includes(r.insV) && !r.delV.some(d => anc.includes(d))) }
const pairOf = k => { const m = k.match(/^expr:(\w+?)(On|Off)\/(\w+)$/); return m ? { fn: m[1] + '/' + m[3], on: m[2] === 'On' } : null }
const tR2 = text('R2')
function explainsRedundancy(x, T) { // X absent from T; does adding X make the next same-function command of T effective?
  const p = pairOf(x.kind); if (!p) return false
  const seq = T.filter(y => pairOf(y.kind)?.fn === p.fn).sort((a, b) => a.from - b.from)
  const before = seq.filter(y => y.from < x.from), after = seq.filter(y => y.from > x.from)
  const state = before.length ? pairOf(before.at(-1).kind).on : false
  const Y = after[0]; if (!Y) return false
  return pairOf(Y.kind).on === state && p.on !== state
}
const W = M.symbols.filter(r => r.carriers.join() === 'Wi1')
for (const D of [10, 20, 30, 45, 60, 75]) {
  const res = { 'R1.1': { ok: 0, n: 0 }, r1: { ok: 0, n: 0 } }; const wrong = []
  for (const x of W) {
    const moved = tR2.some(y => y.kind === x.kind && !y.carriers.includes('Wi1') && Math.abs(y.from - x.from) <= D)
    const expl = explainsRedundancy(x, tR2)
    const guess = moved || expl ? 'r1' : 'R1.1'
    const ed = x.insV
    res[ed].n++; if (guess === ed) res[ed].ok++; else wrong.push(`${x.from}:${x.kind}:${ed}${ed === 'r1' ? '(' + x.deletions.map(d => d.shape + ' ' + (d.editType ?? '') + '/' + (d.motivation ?? '')).join() + ')' : '(' + x.insMotivation + ')'}`)
  }
  console.log(`D=${D}mm  R1.1 ${res['R1.1'].ok}/${res['R1.1'].n}  r1 ${res.r1.ok}/${res.r1.n}`)
  if (D === 30 || D === 60) console.log('   wrong:', wrong.join(' ; '))
}
// how many r1>R2 are explained by each criterion at 30mm
let c = { moved: 0, expl: 0, both: 0, none: 0 }
for (const x of W.filter(x => x.insV === 'r1')) { const m = tR2.some(y => y.kind === x.kind && !y.carriers.includes('Wi1') && Math.abs(y.from - x.from) <= 30), e = explainsRedundancy(x, tR2); c[m && e ? 'both' : m ? 'moved' : e ? 'expl' : 'none']++ }
console.log('r1>R2 criteria at 30mm', c)
// same rule applied to R1.1's 12: do any explain a redundancy?
console.log('R1.1 ins explaining redundancy in R2 text:', W.filter(x => x.insV === 'R1.1' && explainsRedundancy(x, tR2)).map(x => x.from + ':' + x.kind))
