// note variants vs the score: does the reading that agrees with the score come later?
import { ed, sig, V, LR, textOf, fmt, symById, parentOf, place, carrierCopies } from './common.mjs'
import { scoreNotes, recordings } from './score.mjs'
// mm position of each score note, from any aligned symbol (r1 and R4 recordings)
const posOfScoreNote = new Map()
for (const rec of Object.values(recordings)) for (const [sid, nid] of rec) { const s = symById.get(sid); const p = s && place(s); if (p) (posOfScoreNote.get(nid) ?? posOfScoreNote.set(nid, []).get(nid)).push(p.from) }
const scoreAt = [...posOfScoreNote].map(([nid, ps]) => ({ ...scoreNotes.get(nid), mm: ps.reduce((a, b) => a + b) / ps.length }))
const alignedTo = sid => { for (const rec of Object.values(recordings)) if (rec.has(sid)) return scoreNotes.get(rec.get(sid)); return undefined }
// does the score have this pitch at this place? (within tol mm of where the score note is played)
const scoreMatch = (s, tol = 12) => scoreAt.some(n => n.pitch === s.pitch && Math.abs(n.mm - place(s).from) <= tol)
const rows = []
for (const v of ed.versions) {
  const sg = sig.get(v.id); if (sg === 'r1') continue
  for (const e of LR.editsOf(v)) {
    const ins = (e.insert ?? []).filter(s => s.type === 'note'), del = (e.delete ?? []).map(id => symById.get(id)).filter(s => s.type === 'note')
    if (!ins.length && !del.length) continue
    rows.push({ v: sg, type: e.editType ?? '-', mot: (v.motivations.find(m => m.id === e.motivation)?.note ?? e.motivation ?? '-').slice(0, 45), del: del.map(s => `${fmt(s)}${scoreMatch(s) ? '✓' : '✗'}${alignedTo(s.id) ? '(al:' + alignedTo(s.id).pitch + ')' : ''}`).join(' '), ins: ins.map(s => `${fmt(s)}${scoreMatch(s) ? '✓' : '✗'}`).join(' '), delOK: del.filter(s => scoreMatch(s)).length, delN: del.length, insOK: ins.filter(s => scoreMatch(s)).length, insN: ins.length })
  }
}
for (const r of rows) console.log(r.v.padEnd(5), r.type.padEnd(14), r.mot.padEnd(46), 'DEL', r.del.padEnd(40), 'INS', r.ins)
const sum = {}
for (const r of rows) { const k = `${r.v} ${r.type}`; const t = (sum[k] ??= { edits: 0, delOK: 0, delN: 0, insOK: 0, insN: 0 }); t.edits++; t.delOK += r.delOK; t.delN += r.delN; t.insOK += r.insOK; t.insN += r.insN }
console.table(sum)
