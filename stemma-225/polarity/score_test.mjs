import { scoreNotes, recordings, barOf } from './score.mjs'
import { ed, sig, V, symById, place, fmt, textOf } from './common.mjs'
console.log('score notes', scoreNotes.size, 'recordings', Object.entries(recordings).map(([k, m]) => sig.get(k) + ':' + m.size))
const rec = recordings[V.r1.id]
// bar positions in mm from r1 alignment
const pts = [...rec].map(([sid, nid]) => [place(symById.get(sid))?.from, scoreNotes.get(nid)?.date]).filter(([a, b]) => a !== undefined && b !== undefined).sort((a, b) => a[1] - b[1])
const barStart = {}
for (const [mm, d] of pts) { const b = barOf(d); if (!(b in barStart)) barStart[b] = mm }
console.log(JSON.stringify(Object.fromEntries(Object.entries(barStart).map(([b, mm]) => [b, Math.round(mm)]))))
const notesr1 = textOf('r1').filter(s => s.type === 'note')
console.log('r1 notes', notesr1.length, 'aligned', notesr1.filter(s => rec.has(s.id)).length)
const r4 = recordings[V.R4.id]
const notesR4 = textOf('R4').filter(s => s.type === 'note')
console.log('R4 notes', notesR4.length, 'aligned', notesR4.filter(s => r4.has(s.id)).length)
