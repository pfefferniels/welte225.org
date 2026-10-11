// The library's own way: collate copy after copy against what has been collated so far (collationsOf, the
// function connectVersions uses; symbols placed at the median of their carriers as placeOf does). Run over all
// 720 orders of the six copies: does the result depend on the order?
import { createHash } from 'node:crypto'
import { LR, readings, COPIES, edSymbols, featureCopy } from './base.mjs'
import { compare } from './compare.mjs'
const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const byCopy = Object.fromEntries(COPIES.map(c => [c, readings.filter(r => r.copy === c)]))
let uid = 0
function progressive(order, tolerance) {
  const text = []
  const locate = s => ({ from: median(s.carriers.map(r => r.from)), to: median(s.carriers.map(r => r.to)) })
  for (const c of order) {
    const own = byCopy[c].map(r => ({ ...r.sym, id: 'p' + (uid++), carriers: [r] }))
    // collationsOf only reads type/pitch/expressionType/scope and asks locate for places
    const cols = LR.collationsOf(own, text, locate, tolerance)
    const collated = new Set()
    const handed = cols.map(({ symbol, counterpart }) => { collated.add(symbol.id); return [counterpart, symbol.carriers] })
    for (const [counterpart, carriers] of handed) counterpart.carriers.push(...carriers)   // as handOverCarriers does
    for (const s of own) if (!collated.has(s.id)) text.push(s)
  }
  return text
}
const perms = xs => xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]))
const tolArg = process.argv[2]
const tolerance = tolArg ? { toleranceStart: +tolArg, toleranceEnd: +tolArg } : LR.defaultCollationTolerance
const results = new Map()
let stats = []
for (const order of perms(COPIES)) {
  const text = progressive(order, tolerance)
  const sets = text.map(s => s.carriers.map(r => r.rid).sort())
  const multi = new Map(); for (const set of sets) for (const r of set) multi.set(r, (multi.get(r) ?? 0) + 1)
  const doubled = [...multi.values()].filter(n => n > 1).length
  const sameCopyTwice = sets.filter(set => new Set(set.map(r => r.split('|')[0]).map(f => featureCopy.get(f))).size < set.length).length
  const h = createHash('sha1').update(sets.map(s => s.join(',')).sort().join('\n')).digest('hex').slice(0, 10)
  // exact reproduction of edition symbols: a symbol of the result with exactly the edition symbol's readings
  const keyset = new Set(sets.map(s => s.join(',')))
  const exact = edSymbols.filter(s => keyset.has([...s.rids].sort().join(','))).length
  stats.push({ order: order.join(','), h, symbols: text.length, doubled, sameCopyTwice, exact })
  results.set(h, (results.get(h) ?? 0) + 1)
}
console.log('tolerance', JSON.stringify(tolerance), 'orders', stats.length, 'distinct results', results.size)
const ex = stats.map(s => s.exact)
console.log('exact edition symbols: min', Math.min(...ex), 'max', Math.max(...ex), 'of', edSymbols.length)
console.log('readings handed to two symbols: min', Math.min(...stats.map(s => s.doubled)), 'max', Math.max(...stats.map(s => s.doubled)))
console.log('symbols reading one copy twice: min', Math.min(...stats.map(s => s.sameCopyTwice)), 'max', Math.max(...stats.map(s => s.sameCopyTwice)))
console.log('symbols: min', Math.min(...stats.map(s => s.symbols)), 'max', Math.max(...stats.map(s => s.symbols)))
for (const o of ['St1,St2,Wi1,Ch1,Bo1,Ne1', 'Ne1,Ch1,Bo1,Wi1,St2,St1', 'Wi1,St1,St2,Ch1,Ne1,Bo1']) console.log(stats.find(s => s.order === o))
