// Unit of inference: accent pairs (On+Off) instead of single symbols
import { readFileSync } from 'node:fs'
import { infer } from './rule.mjs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const byId = new Map(M.symbols.map(r => [r.id, r]))
// (1) editor's own grouping: edits inserting exactly 2 symbols (accent On/Off) with no deletion
const edits = new Map()
for (const r of M.symbols) { if (!edits.has(r.insEdit)) edits.set(r.insEdit, []); edits.get(r.insEdit).push(r) }
const res = {}
for (const [e, rs] of edits) {
  if (rs.length !== 2 || rs[0].insReplace) continue
  const v = rs[0].insV
  const single = rs.map(r => infer(r.carriers).ins)
  const union = infer([...new Set(rs.flatMap(r => r.carriers))]).ins
  res[v] ??= { pairs: 0, singleOk: 0, unionOk: 0, ex: [] }
  res[v].pairs++; res[v].singleOk += single.filter(x => x === v).length; if (union === v) res[v].unionOk++; else res[v].ex.push(`${rs[0].from}:${rs.map(r => r.kind + '[' + r.carriers.join('+') + ']').join(' ')} union→${union}`)
}
for (const [v, x] of Object.entries(res)) console.log(`${v}: 2-symbol insert edits ${x.pairs}; single-symbol rule right for ${x.singleOk}/${2 * x.pairs} symbols; union rule right for ${x.unionOk}/${x.pairs} pairs`, x.ex.slice(0, 6))
// (2) mechanical pairing: each On whose single-symbol MRCA is not r1 paired with the next Off of the same function within 40 mm
const fnOf = k => { const m = k.match(/^expr:(\w+?)(On|Off)\/(\w+)$/); return m ? { fn: m[1] + '/' + m[3], on: m[2] === 'On' } : null }
const S = M.symbols.filter(r => fnOf(r.kind) && r.insV !== 'G1').sort((a, b) => a.from - b.from)
let changed = 0, fixed = 0, broke = 0; const det = []
for (const a of S) {
  const fa = fnOf(a.kind); if (!fa.on) continue
  const b = S.find(y => y.from > a.from && y.from - a.from <= 40 && fnOf(y.kind).fn === fa.fn && !fnOf(y.kind).on)
  if (!b) continue
  const ua = infer(a.carriers).ins, ub = infer(b.carriers).ins
  if (ua === 'r1' || ub === 'r1' || ua === ub) continue
  const u = infer([...new Set([...a.carriers, ...b.carriers])]).ins
  for (const x of [a, b]) { const before = infer(x.carriers).ins; if (before !== u) { changed++; if (x.insV === u) fixed++; if (x.insV === before) broke++; det.push(`${x.from} ${x.kind} [${x.carriers.join('+')}] editor ${x.insV}: single ${before} → pair ${u}`) } }
}
console.log(`mechanical pairing changes ${changed} symbol assignments: fixes ${fixed}, breaks ${broke}`); det.forEach(d => console.log('  ', d))
