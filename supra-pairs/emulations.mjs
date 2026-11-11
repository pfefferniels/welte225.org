// Two emulations of one roll held against each other, note for note:
// the MIDI this library performs a version as, and a MIDI another
// emulator made of the same roll. Notes are paired by pitch and by their
// order within the pitch, which needs no assumption about the clocks, and what is
// compared is their loudness, as rank and as line.
//
//   node emulations.mjs ours.mid theirs.mid
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const { read } = createRequire(join(resolve(here, '../../linked-rolls'), 'package.json'))('midifile-ts')

/** The notes of a file in seconds, with the velocity refined by a high-resolution prefix (CC 88) where one precedes the note. */
const notesOf = path => {
    const midi = read(readFileSync(path))
    const ticksPerBeat = midi.header.ticksPerBeat
    const timed = midi.tracks.flatMap(track => { let at = 0; return track.map(event => ({ at: at += event.deltaTime, event })) }).sort((a, b) => a.at - b.at)
    let tempo = 500000, seconds = 0, last = 0, fine = 0
    const notes = [], controllers = new Map()
    for (const { at, event } of timed) {
        seconds += (at - last) * tempo / ticksPerBeat / 1e6
        last = at
        if (event.subtype === 'setTempo') tempo = event.microsecondsPerBeat
        if (event.subtype === 'controller') {
            controllers.set(event.controllerType, (controllers.get(event.controllerType) ?? 0) + 1)
            if (event.controllerType === 88) fine = event.value
        }
        if (event.subtype === 'noteOn' && event.velocity > 0) {
            notes.push({ pitch: event.noteNumber, at: seconds, velocity: event.velocity + fine / 128 })
            fine = 0
        }
    }
    return { notes, controllers }
}

const median = values => [...values].sort((a, b) => a - b)[values.length >> 1]
const ranks = values => { const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = []; order.forEach(([, i], k) => { r[i] = k }); return r }
const pearson = (x, y) => {
    const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length
    const sxy = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0)
    return sxy / Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) * y.reduce((s, v) => s + (v - my) ** 2, 0))
}

const [ours, theirs] = process.argv.slice(2).map(notesOf)
// The files hold the same notes where they perform the same reading of the roll, so the n-th note of a pitch
// in one is the n-th of that pitch in the other; pitches the files disagree on in number are left out and counted.
const theirsByPitch = Map.groupBy(theirs.notes, note => note.pitch)
const matched = [...Map.groupBy(ours.notes, note => note.pitch)].flatMap(([pitch, notes]) => {
    const others = theirsByPitch.get(pitch) ?? []
    return notes.length === others.length ? notes.map((note, i) => [note, others[i]]) : []
})
const va = matched.map(([a]) => a.velocity), vb = matched.map(([, b]) => b.velocity)
const from = matched.reduce((least, [a]) => Math.min(least, a.at), Infinity), to = matched.reduce((most, [a]) => Math.max(most, a.at), -Infinity)
// How their clock runs against ours: the ratio of the two by quarter of the roll, each measured from the first note.
const origin = matched.reduce((first, pair) => pair[0].at < first[0].at ? pair : first)
const quarters = [0, 1, 2, 3].map(q => {
    const within = matched.filter(([a]) => a.at > from && Math.floor((a.at - from) / (to - from + 1e-9) * 4) === q)
    return +median(within.map(([a, b]) => (b.at - origin[1].at) / (a.at - origin[0].at))).toFixed(4)
})
console.log(JSON.stringify({
    notes: [ours.notes.length, theirs.notes.length], paired: matched.length,
    seconds: { ours: +(to - from).toFixed(1), theirs: +(matched.reduce((most, [, b]) => Math.max(most, b.at), -Infinity) - origin[1].at).toFixed(1), theirsOverOursByQuarter: quarters },
    velocity: {
        ours: [Math.min(...va), median(va), Math.max(...va)].map(v => +v.toFixed(1)), theirs: [Math.min(...vb), median(vb), Math.max(...vb)].map(v => +v.toFixed(1)),
        pearson: +pearson(va, vb).toFixed(3), spearman: +pearson(ranks(va), ranks(vb)).toFixed(3)
    },
    controllers: { ours: Object.fromEntries(ours.controllers), theirs: Object.fromEntries(theirs.controllers) }
}))
