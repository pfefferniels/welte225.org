// Shared loader for the pattern audit
import { readFileSync } from 'node:fs'
import * as LR from 'linked-rolls'
import { EDITION } from '../paths.mjs'
export { LR }
export const ed = LR.importJsonLd(JSON.parse(readFileSync(EDITION,'utf8')))
export const sig = LR.siglaOf(ed)
export const COPIES = ['St1','St2','Wi1','Ch1','Bo1','Ne1']
export const vBySig = new Map(ed.versions.map(v => [sig.get(v.id), v]))
export const parentOf = new Map(ed.versions.map(v => {
  const p = LR.principalDerivationOf(v); return [sig.get(v.id), p ? sig.get(LR.idOf(p)) : null]
}))
export const ancestorsOrSelf = s => { const out = []; let x = s; while (x) { out.push(x); x = parentOf.get(x) } return out }
export const isAncOrSelf = (a, d) => ancestorsOrSelf(d).includes(a)
export const childrenOf = s => [...parentOf].filter(([c, p]) => p === s).map(([c]) => c)
export const descendantsOrSelf = s => [s, ...childrenOf(s).flatMap(descendantsOrSelf)]
// first-hand version of each copy: from witnessesOf, carriers with no `through`
export const firstHand = {}
for (const v of ed.versions) for (const w of LR.witnessesOf(ed, v.id)) {
  const c = ed.copies.find(c => c.id === w.copy)
  if (w.by === 'carriers' && !w.through) firstHand[c.siglum] = sig.get(v.id)
}
// feature index
export const featIdx = new Map()
for (const c of ed.copies) {
  const acts = [['production', c.production?.produced ?? []], ...c.modifications.map(m => [`${m.type}:${m.purpose ?? ''}`, LR.featuresMadeBy(m)])]
  for (const [act, fs] of acts) for (const f of fs) featIdx.set(f.id, { copy: c.siglum, act, f })
}
export const kindOf = s => s.type === 'note' ? `note:${s.pitch}` : s.type === 'expression' ? `expr:${s.expressionType}/${s.scope}` : `text:${s.text}`
