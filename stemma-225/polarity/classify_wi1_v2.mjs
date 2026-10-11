// Wi1-only readings: r1 (struck/moved by R2) vs R1.1 (own insertion) -- computable predicates
import { readFileSync } from "node:fs"
import { writeFileSync } from 'node:fs'
import { ed, sig, V, LR, textOf, latchRedundancies, fmt, symById, carrierCopies, place, insertedIn, keyOf, opOf } from './common.mjs'
const all = [...symById.values()]
const only = (cs, c) => cs.length === 1 && cs[0] === c
const wi1only = all.filter(s => only(carrierCopies(s), 'Wi1'))
const truth = s => insertedIn.get(s.id) === 'r1' ? 'r1' : 'R1.1'
// texts as the copies carry them (automatic setting: no knowledge of versions)
const copyText = c => all.filter(s => carrierCopies(s).includes(c)).sort((a, b) => place(a).from - place(b).from)
const TA = copyText('Wi1'), TB = copyText('St1')
const otherBranch = all.filter(s => { const c = carrierCopies(s); return c.includes('St1') && !c.includes('Wi1') })
const kind = s => s.type === 'note' ? 'n' + s.pitch : s.expressionType + (keyOf(s)?.includes(':') ? s.scope : '')
const nearestD = (x, pool) => Math.min(Infinity, ...pool.filter(y => kind(y) === kind(x) && y.id !== x.id).map(y => Math.abs(place(y).from - place(x).from)))
// latch partner within a text
function partnerOf(x, text) {
  const k = keyOf(x); if (!k) return null
  const g = text.filter(s => keyOf(s) === k).sort((a, b) => place(a).from - place(b).from)
  const i = g.findIndex(s => s.id === x.id)
  if (opOf(x)[1] === 'on') { const n = g[i + 1]; return n && opOf(n)[1] === 'off' ? n : null }
  const p = g[i - 1]; return p && opOf(p)[1] === 'on' ? p : null
}
// units: Wi1-only readings joined with their latch partner when that is Wi1-only too
const wSet = new Set(wi1only.map(s => s.id))
const unitOf = new Map(); let u = 0
for (const x of wi1only) {
  if (unitOf.has(x.id)) continue
  const p = partnerOf(x, TA)
  const id = (p && wSet.has(p.id) && unitOf.has(p.id)) ? unitOf.get(p.id) : ++u
  unitOf.set(x.id, id); if (p && wSet.has(p.id)) unitOf.set(p.id, id)
}
const redA = latchRedundancies(TA), redB = latchRedundancies(TB)
const resolvesInB = members => { const r = latchRedundancies([...TB, ...members]); return [...redB.keys()].filter(id => !r.has(id)) }
const units = [...new Set(unitOf.values())].map(id => wi1only.filter(s => unitOf.get(s.id) === id))
const feats = units.map(m => ({
  members: m, truth: [...new Set(m.map(truth))].join('+'),
  d: Math.min(...m.map(x => nearestD(x, otherBranch))),
  redA: m.some(x => redA.has(x.id)),
  resolvesB: resolvesInB(m).map(id => fmt(symById.get(id))),
}))
console.log('Wi1-only readings', wi1only.length, 'units', units.length, 'mixed-truth units', feats.filter(f => f.truth.includes('+')).length)
// null model: shared expression readings (Wi1 & St1) – share with a same-kind St1-not-Wi1 reading within W
const shared = all.filter(s => { const c = carrierCopies(s); return c.includes('Wi1') && c.includes('St1') })
const nullRate = W => { const sh = shared.filter(s => s.type === 'expression'); return sh.filter(s => nearestD(s, otherBranch) <= W).length / sh.length }
const nullRateN = W => { const sh = shared.filter(s => s.type === 'note'); return sh.filter(s => nearestD(s, otherBranch) <= W).length / sh.length }
const confusion = pred => { const t = {}; for (const f of feats) for (const x of f.members) { const k = `${truth(x)}->${pred(f)}`; t[k] = (t[k] ?? 0) + 1 } return t }
for (const W of [5, 10, 20, 30, 40, 50, 60]) {
  console.log(`W=${String(W).padStart(2)} null(expr)=${nullRate(W).toFixed(2)} null(note)=${nullRateN(W).toFixed(2)} |`,
    'shift:', JSON.stringify(confusion(f => f.d <= W ? 'r1' : 'R1.1')),
    '| shift∨redA:', JSON.stringify(confusion(f => f.d <= W || f.redA ? 'r1' : 'R1.1')),
    '| shift∨explainB:', JSON.stringify(confusion(f => f.d <= W || f.resolvesB.length ? 'r1' : 'R1.1')),
    '| shift∨redA∨explainB:', JSON.stringify(confusion(f => f.d <= W || f.redA || f.resolvesB.length ? 'r1' : 'R1.1')))
}
console.log('explainB alone', JSON.stringify(confusion(f => f.resolvesB.length ? 'r1' : 'R1.1')), 'redA alone', JSON.stringify(confusion(f => f.redA ? 'r1' : 'R1.1')))
for (const f of feats) if (f.d > 30 || f.redA || f.resolvesB.length) console.log(f.truth.padEnd(5), f.members.map(fmt).join(' ').padEnd(40), 'd=' + f.d.toFixed(0), f.redA ? 'redundant-in-Wi1' : '', f.resolvesB.length ? 'makes-effective-in-St1: ' + f.resolvesB.join(' ') : '')
writeFileSync(new URL('wi1only_units.json', import.meta.url), JSON.stringify(feats.map(f => ({ ...f, members: f.members.map(fmt) })), null, 1))

// ---- variant with emulator-based redundancy (remove X from Wi1's text, re-emulate on the T-100: < 1 velocity step and no pedal change)
const effRows = new Map(JSON.parse(readFileSync(new URL('eff_R1.1.json', import.meta.url))).map(r => [r.id, r]))
const emuIneff = id => { const r = effRows.get(id); return r && !(Math.abs(r.maxDv) >= 1 || r.damper > 0.05 || r.hammerRail > 0.05) }
for (const f of feats) f.redEmu = f.members.some(x => x.type === 'expression' && emuIneff(x.id) && !/Rewind/.test(x.expressionType))
console.log('\nwith emulator-based redundancy (Rewind excluded):')
for (const W of [20, 30, 40, 42.4, 50, 60, 100]) console.log(`W=${W}`, 'shift∨redEmu∨explainB:', JSON.stringify(confusion(f => f.d <= W || f.redEmu || f.resolvesB.length ? 'r1' : 'R1.1')), ' units wrong:', feats.filter(f => (f.d <= W || f.redEmu || f.resolvesB.length ? 'r1' : 'R1.1') !== f.truth).map(f => f.members.map(fmt).join('+')).join(' | '))
console.log('per-criterion coverage of the 59 r1 readings at W=50: shift', feats.filter(f => f.truth === 'r1' && f.d <= 50).reduce((n, f) => n + f.members.length, 0),
  '| not shift but redundant (emu)', feats.filter(f => f.truth === 'r1' && f.d > 50 && f.redEmu).reduce((n, f) => n + f.members.length, 0),
  '| not shift, not redundant, explain-redundancy', feats.filter(f => f.truth === 'r1' && f.d > 50 && !f.redEmu && f.resolvesB.length).reduce((n, f) => n + f.members.length, 0))
