// Step 5: pattern -> version rule (MRCA insertion, maximal-lacking-subtree deletions; Dollo)
import { readFileSync, writeFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const parentOf = M.parentOf, fh = M.firstHand
const nodes = Object.keys(parentOf)
const children = n => nodes.filter(c => parentOf[c] === n)
const anc = n => { const o = []; while (n) { o.push(n); n = parentOf[n] } return o }
const sub = n => [n, ...children(n).flatMap(sub)]
const copyAt = Object.fromEntries(Object.entries(fh).map(([c, v]) => [v, c]))
const hasCopy = n => sub(n).some(x => copyAt[x])
const mrca = vs => { const as = vs.map(anc); return as[0].find(a => as.every(x => x.includes(a))) }
export function infer(carriers) {
  const P = carriers.map(c => fh[c])
  if (!P.length) return { ins: null, del: [], violations: [] }
  const ins = mrca(P)
  // present nodes under Dollo: all nodes on paths ins -> p
  const present = new Set(P.flatMap(p => { const a = anc(p); return a.slice(0, a.indexOf(ins) + 1) }))
  const violations = [...present].filter(n => copyAt[n] && !carriers.includes(copyAt[n])) // copied nodes forced present but lacking
  const del = []
  const walk = n => { for (const c of children(n)) { if (present.has(c)) walk(c); else if (hasCopy(c)) del.push(c) } }
  walk(ins)
  return { ins, del: del.sort(), violations: violations.map(n => copyAt[n]) }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = []
  const stat = {}
  const bump = (k, ok) => { stat[k] ??= { n: 0, ok: 0 }; stat[k].n++; if (ok) stat[k].ok++ }
  const dis = {}
  for (const view of ['raw', 'transfer']) {
    for (const r of M.symbols) {
      const car = view === 'raw' ? r.carriers : r.carriersT
      const delE = (view === 'raw' ? r.delV : r.delVT).filter(d => d !== 'r5').sort()
      if (view === 'transfer' && r.isGreenTransfer) continue // green re-spelling of a red reading: not an independent insertion
      const g = infer(car)
      const insOk = g.ins === r.insV
      const delOk = g.del.join() === delE.join()
      bump(`${view} ins ${r.insV}`, insOk)
      for (const d of new Set([...delE])) bump(`${view} del ${d}`, insOk && g.del.includes(d))
      if (view === 'raw') {
        const key = `${car.join('+')} | editor ${r.insV}${delE.length ? '>' + delE.join('/') : ''} | rule ${g.ins}${g.del.length ? '>' + g.del.join('/') : ''}${g.violations.length ? ' VIOL:' + g.violations : ''}`
        if (!insOk || !delOk) dis[key] = (dis[key] ?? 0) + 1
        out.push({ id: r.id, kind: r.kind, from: r.from, carriers: car, editor: { ins: r.insV, del: delE }, rule: g, insOk, delOk })
      }
    }
  }
  // deletion-level counts for the rule (false positives too)
  for (const [k, v] of Object.entries(stat).sort()) console.log(k.padEnd(22), `${v.ok}/${v.n}`)
  console.log('\nDISAGREEMENTS (raw view):')
  for (const [k, v] of Object.entries(dis).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k)
  const tot = out.length, both = out.filter(x => x.insOk && x.delOk).length
  console.log('\nsymbols', tot, 'ins+del reproduced exactly', both, 'ins only', out.filter(x => x.insOk).length)
  writeFileSync(new URL('rule_vs_editor.json', import.meta.url), JSON.stringify(out, null, 1))
}
