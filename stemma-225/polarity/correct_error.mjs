// R2's 'correct-error' moves of crescendo commands: is the St1 reading better aligned to the notes (beat / onset) than the Wi1 reading?
import { ed, sig, V, LR, textOf, fmt, symById, place, carrierCopies } from './common.mjs'
import { scoreNotes, recordings, barOf, beatOf } from './score.mjs'
const DIV = 67 // T-100 division at track 54 -> MIDI 67
const notes = textOf('r1').filter(s => s.type === 'note').map(s => ({ s, at: place(s).from, half: s.pitch >= DIV ? 'treble' : 'bass', score: scoreNotes.get(recordings[V.r1.id].get(s.id)) }))
const metric = d => { const b = beatOf(d); return b === 0 ? 'downbeat' : b === 2 ? 'beat3' : Number.isInteger(b) ? 'beat' : 'offbeat' }
// for an On: the next note onset in its half; for an Off: the previous
function target(x) {
  const at = place(x).from, half = x.scope
  const pool = notes.filter(n => n.half === half)
  if (/On$/.test(x.expressionType)) { const n = pool.filter(n => n.at >= at - 2).sort((a, b) => a.at - b.at)[0]; return n && { lead: n.at - at, met: n.score ? metric(n.score.date) : "?", pitch: n.s.pitch } }
  const n = pool.filter(n => n.at <= at + 2).sort((a, b) => b.at - a.at)[0]; return n && { lead: at - n.at, met: n.score ? metric(n.score.date) : "?", pitch: n.s.pitch }
}
const rows = []
for (const e of LR.editsOf(V.R2)) {
  if (e.editType !== 'correct-error' && e.editType !== 'shift') continue
  const del = (e.delete ?? []).map(id => symById.get(id)).filter(s => s.type === 'expression'), ins = (e.insert ?? []).filter(s => s.type === 'expression')
  for (let i = 0; i < Math.min(del.length, ins.length); i++) { const x = del[i], y = ins.find(y => y.expressionType === x.expressionType && y.scope === x.scope) ?? ins[i]; rows.push({ type: e.editType, x: fmt(x), y: fmt(y), tx: target(x), ty: target(y) }) }
}
for (const r of rows) console.log(r.type.padEnd(14), r.x.padEnd(16), JSON.stringify(r.tx), ' -> ', r.y.padEnd(16), JSON.stringify(r.ty))
// reference: shared accents (in Wi1 and St1)
const shared = textOf('r1').filter(s => s.type === 'expression' && /Crescendo/.test(s.expressionType) && carrierCopies(s).includes('St1') && carrierCopies(s).includes('Wi1'))
const med = a => { const b = [...a].sort((p, q) => p - q); return b[Math.floor(b.length / 2)] }
for (const sp of ['On', 'Off']) {
  const ref = shared.filter(s => s.expressionType.endsWith(sp)).map(target).filter(Boolean)
  const xs = rows.filter(r => r.x.includes(sp + '.')).map(r => r.tx).filter(Boolean), ys = rows.filter(r => r.y.includes(sp + '.')).map(r => r.ty).filter(Boolean)
  const strong = a => a.filter(t => t.met === 'downbeat' || t.met === 'beat3').length + '/' + a.length
  console.log(`Cr${sp}: median lead to target note: shared ${med(ref.map(t => t.lead)).toFixed(1)} mm (n=${ref.length}), Wi1 readings ${med(xs.map(t => t.lead)).toFixed(1)}, St1 readings ${med(ys.map(t => t.lead)).toFixed(1)}; target on beat 1/3: shared ${strong(ref)}, Wi1 ${strong(xs)}, St1 ${strong(ys)}`)
}
