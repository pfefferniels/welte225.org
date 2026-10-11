// Every place where the blind collation (scatter windows, single linkage) and the edition group readings differently.
import { writeFileSync } from 'node:fs'
import { readings, readingById, edSymbols, edSymbolOfRid, ed, sig } from './base.mjs'
import { blindCollation, measure } from './blind.mjs'
import { compare } from './compare.mjs'
const { clusters, windows } = blindCollation({ linkage: 'single' })
const r = compare(clusters)
const deleters = new Map()
for (const v of ed.versions) for (const e of v.edits ?? []) for (const d of e.delete ?? []) (deleters.get(d) ?? deleters.set(d, []).get(d)).push({ v: sig.get(v.id), e })
const label = s => {
  const ins = `${s.version}${s.edit.editType ? ':' + s.edit.editType : ''}${s.edit.motivation && !/^[0-9a-f]{8}-/.test(s.edit.motivation) ? ':' + s.edit.motivation : s.edit.motivation ? ':(motivated)' : ''}`
  const del = (deleters.get(s.id) ?? []).filter(x => x.v !== 'G1').map(({ v, e }) => `struck by ${v}${e.editType ? ':' + e.editType : ''}${e.motivation && !/^[0-9a-f]{8}-/.test(e.motivation) ? ':' + e.motivation : e.motivation ? ':(motivated)' : ''}`)
  return `${s.copies.join('+')} [ins ${ins}${del.length ? '; ' + del.join('; ') : ''}]`
}
const seen = new Set(), comps = []
for (const s of edSymbols) {
  const st = r.status.get(s.id); if (st === 'exact' || st === 'dropped' || seen.has(s.id)) continue
  const cl = new Set(), ss = new Set([s]); let grew = true
  while (grew) { grew = false
    for (const t of ss) for (const rid of t.rids) { const c = r.clusterOf.get(rid); if (c !== undefined && !cl.has(c)) { cl.add(c); grew = true } }
    for (const c of cl) for (const rid of clusters[c].rids) { const t = edSymbolOfRid.get(rid); if (t && !ss.has(t)) { ss.add(t); grew = true } }
  }
  ss.forEach(t => seen.add(t.id))
  const S = [...ss], C = [...cl]
  const type = S.length > C.length ? 'merge' : S.length < C.length ? 'split' : 'regroup'
  // the decisive pair: for a merge the cross-symbol pair the blind joined at the smallest distance;
  // for a split the cross-cluster pair the edition joined at the smallest distance
  let best
  const groupsA = type === 'merge' ? S.map(t => t.rids) : C.map(c => clusters[c].rids)
  for (let i = 0; i < groupsA.length; i++) for (let j = i + 1; j < groupsA.length; j++) for (const a of groupsA[i]) for (const b of groupsA[j]) {
    const x = readingById.get(a), y = readingById.get(b); if (x.copy === y.copy) continue
    const m = measure(windows, x, y, {}); if (m && (!best || m.w < best.m.w)) best = { x, y, m }
  }
  const at = Math.min(...S.flatMap(t => t.rids.map(x => readingById.get(x).from)))
  comps.push({ at: +at.toFixed(1), key: s.key, type, edition: S.map(label), blind: C.map(c => clusters[c].pattern),
    decisive: best && { pair: `${best.x.copy}-${best.y.copy}`, dOnset: +best.m.dS.toFixed(2), dEnd: +best.m.dE.toFixed(2),
      windowOnset: `${best.m.win.oS.toFixed(2)}±${best.m.win.tS.toFixed(2)}`, windowEnd: `${best.m.win.oE.toFixed(2)}±${best.m.win.tE.toFixed(2)}`,
      zOnset: +best.m.s.toFixed(2), zEnd: +best.m.e.toFixed(2) } })
}
comps.sort((a, b) => a.at - b.at)
for (const c of comps) console.log(`${c.at} ${c.key} ${c.type}: ED ${c.edition.join(' | ')} || BLIND ${c.blind.join(' | ')} || ${c.decisive ? `${c.decisive.pair} dOn ${c.decisive.dOnset} dEnd ${c.decisive.dEnd} win ${c.decisive.windowOnset} / ${c.decisive.windowEnd} -> ${c.decisive.zOnset}/${c.decisive.zEnd}` : ''}`)
const cat = {}; for (const c of comps) { const k = c.type + ' ' + (c.key.startsWith('note') ? 'note' : 'expr'); cat[k] = (cat[k] ?? 0) + 1 }
console.log(cat)
// how many merges hinge on a single bridging copy (the decisive edge involves Ne1 or Ch1)
const bridge = {}; for (const c of comps.filter(c => c.type === 'merge')) for (const s of c.decisive.pair.split('-')) bridge[s] = (bridge[s] ?? 0) + 1
console.log('copies in the decisive (closest) edge of merges', bridge)
const edge = comps.filter(c => c.type === 'merge' && Math.max(c.decisive.zOnset, c.decisive.zEnd) > 0.8).length
console.log('merges whose decisive edge uses > 80% of the window:', edge, 'of', comps.filter(c => c.type === 'merge').length)
writeFileSync(new URL('out/disagreements.json', import.meta.url), JSON.stringify(comps, null, 1))
