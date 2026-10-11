// Step 1: presence matrix of every inserted symbol over the 6 feature-bearing copies
import { writeFileSync } from 'node:fs'
import { ed, sig, LR, featIdx, COPIES, kindOf, firstHand, isAncOrSelf, parentOf } from './common.mjs'
const rows = new Map()
const short = m => m && m.length > 30 ? 'uuid:' + m.slice(0, 8) : m
for (const v of ed.versions) {
  const V = sig.get(v.id)
  for (const e of LR.editsOf(v)) {
    const ins = e.insert ?? [], del = e.delete ?? []
    for (const s of ins) {
      const carriers = LR.idsOf(s.carriers).map(id => featIdx.get(id)).filter(Boolean)
      const place = LR.placeOf(ed, s)
      rows.set(s.id, {
        id: s.id, type: s.type, kind: kindOf(s), pitch: s.pitch ?? null, expressionType: s.expressionType ?? null, scope: s.scope ?? null, text: s.text ?? null,
        from: place ? +place.from.toFixed(2) : null, to: place ? +place.to.toFixed(2) : null,
        insV: V, insEdit: e.id, insEditType: e.editType ?? null, insMotivation: short(e.motivation) ?? null,
        insShape: `${ins.length}i/${del.length}d`, insReplace: del.length > 0, insPartners: del, insSiblings: ins.filter(x => x.id !== s.id).map(x => x.id),
        carriers: [...new Set(carriers.map(c => c.copy))].filter(c => COPIES.includes(c)).sort((a, b) => COPIES.indexOf(a) - COPIES.indexOf(b)),
        carrierDetail: carriers.map(c => ({ copy: c.copy, feature: c.f.id, from: +c.f.horizontal.from.toFixed(2), to: +c.f.horizontal.to.toFixed(2), track: c.f.vertical?.from, act: c.act })),
        deletions: [],
      })
    }
  }
}
for (const v of ed.versions) {
  const V = sig.get(v.id)
  for (const e of LR.editsOf(v)) for (const id of e.delete ?? []) {
    const r = rows.get(id)
    if (!r) { console.log('deletion of unknown symbol', V, id); continue }
    r.deletions.push({ v: V, edit: e.id, editType: e.editType ?? null, motivation: short(e.motivation) ?? null, shape: `${e.insert?.length ?? 0}i/${e.delete.length}d`, replacedBy: (e.insert ?? []).map(x => x.id) })
  }
}
// expected carriers under the editor's stemma
for (const r of rows.values()) {
  r.delV = r.deletions.map(d => d.v)
  r.expected = COPIES.filter(c => isAncOrSelf(r.insV, firstHand[c]) && !r.delV.some(d => isAncOrSelf(d, firstHand[c])))
  // transfer view: a red symbol struck by a G1 recoding edit that inserts a green replacement is carried by Bo1 "in other words"
  r.recodedBy = r.deletions.filter(d => d.v === 'G1' && d.editType === 'recoding' && d.replacedBy.length > 0).flatMap(d => d.replacedBy)
  r.isGreenTransfer = r.insV === 'G1' && r.insEditType === 'recoding' && r.insReplace
  r.carriersT = r.recodedBy.length && !r.carriers.includes('Bo1') ? [...r.carriers, 'Bo1'].sort((a, b) => COPIES.indexOf(a) - COPIES.indexOf(b)) : r.carriers
  r.delVT = r.deletions.filter(d => !(d.v === 'G1' && d.editType === 'recoding' && d.replacedBy.length > 0)).map(d => d.v)
  r.expectedT = COPIES.filter(c => isAncOrSelf(r.insV, firstHand[c]) && !r.delVT.some(d => isAncOrSelf(d, firstHand[c])))
}
// cross-check against LR.snapshotOf
const snaps = Object.fromEntries(COPIES.map(c => [c, new Set(LR.snapshotOf(ed, vBy(firstHand[c]).id).map(s => s.id))]))
function vBy(s) { return ed.versions.find(v => sig.get(v.id) === s) }
let bad = 0
for (const r of rows.values()) { const exp2 = COPIES.filter(c => snaps[c].has(r.id)); if (exp2.join() !== r.expected.join()) bad++ }
console.log('symbols', rows.size, 'expected-vs-snapshotOf disagreements', bad)
const arr = [...rows.values()].sort((a, b) => (a.from ?? 0) - (b.from ?? 0))
writeFileSync(new URL('matrix.json', import.meta.url), JSON.stringify({ firstHand, parentOf: Object.fromEntries(parentOf), copies: COPIES, symbols: arr }, null, 1))
const csvCols = ['id', 'kind', 'from', 'to', 'insV', 'insEditType', 'insMotivation', 'insShape', 'delV', 'carriers', 'expected', 'carriersT', 'expectedT', ...COPIES]
const esc = x => { const s = Array.isArray(x) ? x.join('|') : (x ?? '') + ''; return /[,"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
writeFileSync(new URL('matrix.csv', import.meta.url), [csvCols.join(','), ...arr.map(r => csvCols.map(c => COPIES.includes(c) ? (r.carriers.includes(c) ? 1 : 0) : esc(r[c])).join(','))].join('\n'))
console.log('wrote matrix.json, matrix.csv')
