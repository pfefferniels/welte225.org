import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { ed, sig, V, LR, symById, place, fmt, textOf, latchRedundancies, carrierCopies, keyOf, opOf } from './common.mjs'
const all = [...symById.values()]
const copyText = c => all.filter(s => carrierCopies(s).includes(c)).sort((a, b) => place(a).from - place(b).from)
const FIRST = 1400, LAST = 9750, BARS = 32.5 // music span from the score alignment (pickup at 1438 mm, bar 32 at 9282 mm)
const isDyn = s => s.type === 'expression' && /Mezzoforte|Crescendo|Forzando|Sforzando/.test(s.expressionType)
const isPed = s => s.type === 'expression' && /Pedal/.test(s.expressionType)
function intervals(text, fn) { // latched intervals On->Off of a function family
  const out = []; const groups = new Map()
  for (const s of text) { const k = keyOf(s); if (!k || !k.startsWith(fn)) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s) }
  for (const g of groups.values()) { let open = null; for (const s of g) { const sp = opOf(s)[1]; if (sp === 'on' && !open) open = s; else if (sp === 'off' && open) { out.push(place(s).from - place(open).from); open = null } } }
  return out
}
function stats(text, label, effFile) {
  const inSpan = text.filter(s => place(s) && place(s).from > FIRST && place(s).from < LAST)
  const dyn = inSpan.filter(isDyn), ped = inSpan.filter(isPed)
  const red = latchRedundancies(text)
  const redIn = inSpan.filter(s => red.has(s.id)).length
  const cr = intervals(inSpan, 'crescendo'), fz = intervals(inSpan, 'sforzando'), mf = intervals(inSpan, 'mezzoforte')
  const accents = cr.filter(d => d <= 60).length
  let emuNone = ''
  if (effFile && existsSync(effFile)) { const rows = JSON.parse(readFileSync(effFile)); emuNone = rows.filter(r => r.at > FIRST && r.at < LAST && !(Math.abs(r.maxDv) >= 1 || r.damper > 0.05 || r.hammerRail > 0.05)).length }
  return { label, notes: inSpan.filter(s => s.type === 'note').length, dyn: dyn.length, dynPerBar: +(dyn.length / BARS).toFixed(2), dynPer1000mm: +(dyn.length / (LAST - FIRST) * 1000).toFixed(1), crPairs: cr.length, crAccents: accents, fzPairs: fz.length, mfPairs: mf.length, ped: ped.length, latchRed: redIn, emuIneffective: emuNone }
}
const rows = []
for (const c of ['Wi1', 'St1', 'St2', 'Ch1', 'Ne1']) rows.push(stats(copyText(c), 'copy ' + c))
// green copy: held commands, chains merged
{ const t = copyText('Bo1').filter(s => place(s) && place(s).from > FIRST && place(s).from < LAST)
  const held = t.filter(s => s.type === 'expression' && /Crescendo|Sforzando|Mezzoforte/.test(s.expressionType))
  const runs = {}; for (const s of held) { const k = s.expressionType + s.scope; (runs[k] ??= []).push(place(s)) }
  let n = 0; for (const g of Object.values(runs)) { g.sort((a, b) => a.from - b.from); let end = -1e9; for (const p of g) { if (p.from - end > 3) n++; end = Math.max(end, p.to) } }
  rows.push({ label: 'copy Bo1 (green; held runs, not comparable 1:1)', notes: t.filter(s => s.type === 'note').length, dynHeldRuns: n, dynPerBar: +(n / BARS).toFixed(2) }) }
for (const v of ['r1', 'R1.1', 'R2', 'r3', 'R4', 'L1', 'L2']) rows.push(stats(textOf(v), 'version ' + v, new URL(`eff_${v}.json`, import.meta.url)))
console.table(rows)
writeFileSync(new URL('density.json', import.meta.url), JSON.stringify(rows, null, 1))
