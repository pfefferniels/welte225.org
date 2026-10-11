import { ed, sig, V, LR, textOf, latchRedundancies, fmt, symById, parentOf, carrierCopies, place, insertedIn, deletedIn, editOfSymbol } from './common.mjs'
const only = [...symById.values()].filter(s => { const c = carrierCopies(s); return c.length === 1 && c[0] === 'Wi1' })
const tab = {}
for (const s of only) { const k = `${insertedIn.get(s.id)} del:${(deletedIn.get(s.id) ?? []).join(',')} ${s.type}`; tab[k] = (tab[k] ?? 0) + 1 }
console.log('Wi1-only symbols', only.length, tab)
// R2 deletions: carriers
const R2 = V['R2']
const dels = LR.deletedBy(R2).map(id => symById.get(id))
const t2 = {}
for (const s of dels) { const k = carrierCopies(s).join(',') + ' ' + s.type; t2[k] = (t2[k] ?? 0) + 1 }
console.log('R2 deletions by carriers', t2)
// R1.1 insertions and deletions
for (const s of LR.insertedBy(V['R1.1'])) console.log('R1.1 INS', fmt(s), carrierCopies(s))
for (const id of LR.deletedBy(V['R1.1'])) console.log('R1.1 DEL', fmt(symById.get(id)), carrierCopies(symById.get(id)))
// r1 symbols carried by Wi1 only and not deleted
