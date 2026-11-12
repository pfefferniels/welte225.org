// What each proposed edit does, as music, told once for the expression
// and once for the notes.
//
// An edit of the expression is undone and the version performed again:
// where the curve of its half of the keyboard (or of its pedal) then lies
// a fifth of a marking or more from where it lay while notes are struck,
// the edit is heard, and what it is heard as is read off how long that
// lasts, which way it goes and which notes lie under it. Where undoing
// one edit leaves a valve standing otherwise to the end of the roll, the
// next edit on that valve is undone with it, the two being one gesture.
// A command that only stands elsewhere (the library's "shift", or the
// same command on the other copy up to 40 mm away) is a matter of timing
// and is not undone.
//
// An edit of the notes is told by what it does to the note and by what
// stands around it: held longer, released sooner, struck earlier or
// later, struck again where the other copy holds, a tone or less away on
// the other copy, another pitch, or a note one copy has more, and then
// whether that note doubles another at the octave, fills a chord, lies
// under it or on top, or stands by itself.
//
// Each edit is also laid to the branch it stands on, to see how much a
// version has of its own once timing and paper are set aside.
//
//   node effects.mjs [--out out] [--linked-rolls ../../linked-rolls] > effects.json
//
// WM 662 is not told: its first two metres do not align.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { availableParallelism } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) =>
    arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []))
const libraryAt = resolve(args['linked-rolls'] ?? join(here, '../../linked-rolls'))
const out = resolve(here, args.out ?? 'out')
const MISALIGNED = [662]
// `--notes only` tells the notes alone, for which nothing has to be performed
const notesOnly = args.notes === 'only'

const MARKING = 0.25, APART = 0.05, STEP = 2, JOIN = 15, REACH = 40, DIVISION = 54, SHORT = 1.5
const median = values => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null
const round = (value, digits = 2) => value === null || value === undefined ? null : +value.toFixed(digits)

/** One roll: every edit of no shape with what it comes to. */
const tell = async roll => {
    const lib = await import(pathToFileURL(join(libraryAt, 'lib/index.js')).href)
    const { welteT100System: system } = await import(pathToFileURL(join(libraryAt, 'lib/systems/welteT100/system.js')).href)
    const bar = system.trackerBar
    const edition = lib.importJsonLd(JSON.parse(readFileSync(join(out, `wm${roll}`, 'edition.jsonld'), 'utf8')))
    const shown = edition.copies.map(copy => edition.versions.find(version =>
        lib.witnessesOf(edition, version.id).some(witness => witness.copy === copy.id && !witness.through)))
    if (!shown.every(Boolean) || shown[0].id === shown[1].id) return []

    const readingOf = symbol => {
        const place = lib.placeOf(edition, symbol)
        const operation = symbol.type === 'expression' ? bar.operationOf(symbol.expressionType) : undefined
        return place && {
            id: symbol.id, type: symbol.type, from: place.from, to: place.to, pitch: symbol.pitch,
            key: symbol.type === 'note' ? `note ${symbol.pitch}` : `${symbol.expressionType} ${symbol.scope}`,
            operates: operation?.operates, half: operation?.sided ? symbol.scope : undefined,
            valve: operation && `${operation.operates}${operation.sided ? ' ' + symbol.scope : ''}`,
        }
    }
    const sigla = lib.siglaOf(edition)
    const texts = shown.map(version => lib.snapshotOf(edition, version.id).filter(symbol => symbol.type === 'note' || symbol.type === 'expression')
        .flatMap(symbol => readingOf(symbol) ?? []).sort((a, b) => a.from - b.from))
    const ids = texts.map(text => new Set(text.map(reading => reading.id)))
    const alone = texts.map((text, i) => text.filter(reading => !ids[1 - i].has(reading.id)))
    const byId = texts.map(text => new Map(text.map(reading => [reading.id, reading])))
    const notesOf = text => text.filter(reading => reading.type === 'note')

    /** A version performed: its curves, read at any place, and the clock. */
    const performanceOf = (version, inEdition = edition) => {
        const emulated = lib.emulate(system, version, inEdition)
        const reader = name => {
            const curve = emulated.curves.find(c => c.name === name)
            let i = 0
            return place => {
                while (i + 1 < curve.place.length && curve.place[i + 1] <= place) i++
                while (i > 0 && curve.place[i] > place) i--
                return [curve.travel[i], curve.seconds[i]]
            }
        }
        return Object.fromEntries(['bass', 'treble', 'damper', 'hammerRail'].map(name => [name, reader(name)]))
    }

    const told = []
    for (const [i, version] of shown.entries()) {
        if (lib.derivationsOf(version).length === 0) continue
        const own = texts[i], other = texts[1 - i]
        const struck = notesOf(own).map(note => ({ ...note, half: note.pitch !== undefined && bar.positionOf({ type: 'note', pitch: note.pitch }) >= DIVISION ? 'treble' : 'bass' }))
        struck.forEach((note, k) => {
            note.top = note.bottom = true
            for (const j of [-1, 1]) for (let n = k + j; n >= 0 && n < struck.length && Math.abs(struck[n].from - note.from) <= 8; n += j) {
                if (struck[n].pitch > note.pitch) note.top = false
                if (struck[n].pitch < note.pitch) note.bottom = false
            }
        })
        const [start, end] = [struck[0].from - 20, struck.at(-1).from + 20]
        const base = notesOnly ? null : performanceOf(version)
        const grid = []; for (let place = start; place <= end; place += STEP) grid.push(place)
        const sampled = name => grid.map(place => base[name](place))
        const baseline = notesOnly ? null : { bass: sampled('bass'), treble: sampled('treble'), damper: sampled('damper'), hammerRail: sampled('hammerRail') }

        /** What undoing these edits does to one curve: where it is heard, for how long, which way, under which notes. */
        const undone = (editIds, name, threshold, half) => {
            const without = { ...edition, versions: edition.versions.map(v => v.id === version.id ? { ...v, edits: v.edits.filter(edit => !editIds.has(edit.id)) } : v) }
            const read = performanceOf(without.versions.find(v => v.id === version.id), without)[name]
            // with the edit, less without it: above nought where the edit makes for more
            const difference = grid.map((place, k) => baseline[name][k][0] - read(place)[0])
            const open = Math.abs(difference.at(-1)) >= threshold
            const runs = []
            difference.forEach((d, k) => {
                if (Math.abs(d) < threshold) return
                const last = runs.at(-1)
                if (last && grid[k] - grid[last.to] <= JOIN) last.to = k
                else runs.push({ from: k, to: k })
            })
            const heard = runs.map(run => {
                const under = struck.filter(note => (!half || note.half === half) && note.from >= grid[run.from] && note.from <= grid[run.to])
                const inside = difference.slice(run.from, run.to + 1)
                return { under, seconds: baseline[name][run.to][1] - baseline[name][run.from][1], area: inside.reduce((sum, d) => sum + d, 0), peak: Math.max(...inside.map(Math.abs)), length: grid[run.to] - grid[run.from] }
            }).filter(run => run.under.length > 0)
            const under = heard.flatMap(run => run.under)
            return {
                open, heard: heard.length > 0,
                seconds: round(heard.reduce((sum, run) => sum + run.seconds, 0), 1),
                more: heard.reduce((sum, run) => sum + run.area, 0) > 0,
                peak: heard.length ? round(Math.max(...heard.map(run => run.peak)) / MARKING) : 0,
                share: heard.reduce((sum, run) => sum + run.length, 0) / (end - start),
                notes: under.length, strokes: under.reduce((n, note, k) => k === 0 || note.from - under[k - 1].from > 8 ? n + 1 : n, 0),
                melody: under.some(note => note.top), bassLine: under.some(note => note.bottom),
            }
        }

        const symbols = new Map(edition.versions.flatMap(v => v.edits.flatMap(edit => edit.insert ?? [])).map(symbol => [symbol.id, symbol]))
        const edits = version.edits.map(edit => {
            // what the edit inserts stands in this copy's text; what it deletes stood in the text it derives from
            const inserted = (edit.insert ?? []).flatMap(symbol => byId[i].get(symbol.id) ?? []).map(reading => ({ ...reading, side: i, inserted: true }))
            const deleted = (edit.delete ?? []).flatMap(id => byId[1 - i].get(id) ?? (symbols.has(id) ? readingOf(symbols.get(id)) ?? [] : [])).map(reading => ({ ...reading, side: 1 - i, inserted: false }))
            const readings = [...inserted, ...deleted]
            return { edit, shape: lib.shapeOf(edition, version.id, edit) ?? 'unshaped', readings, inserted, deleted, place: Math.min(...readings.map(reading => reading.from)), done: false }
        }).filter(({ readings }) => readings.length > 0).sort((a, b) => a.place - b.place)

        const twinOf = reading => alone[1 - reading.side].filter(candidate => candidate.key === reading.key && Math.abs(candidate.from - reading.from) <= REACH)
            .sort((a, b) => Math.abs(a.from - reading.from) - Math.abs(b.from - reading.from))[0]
        const branch = { roll, branch: sigla.get(version.id) ?? version.id, copy: edition.copies[i].siglum }

        for (const entry of edits) {
            if (entry.done) continue
            const { readings, inserted, deleted, shape } = entry
            const record = result => { told.push({ ...branch, shape, ...result }); entry.done = true }

            // ---- notes
            if (readings.every(reading => reading.type === 'note')) {
                const note = readings[0], mine = texts[note.side], theirs = texts[1 - note.side]
                const length = round(note.to - note.from, 1)
                if (shape === 'prolong') { record({ what: 'note', does: 'held longer', by: round(Math.abs((inserted[0].to - inserted[0].from) - (deleted[0].to - deleted[0].from)), 1) }); continue }
                if (shape === 'shorten') { record({ what: 'note', does: 'released sooner', by: round(Math.abs((inserted[0].to - inserted[0].from) - (deleted[0].to - deleted[0].from)), 1) }); continue }
                if (shape === 'shift') { record({ what: 'note', does: 'earlier or later', apart: round(Math.abs(inserted[0].from - deleted[0].from), 1) }); continue }
                if (inserted.length > 0 && deleted.length > 0) {
                    const pitches = new Set(readings.map(reading => reading.pitch))
                    if (pitches.size === 1) record({ what: 'note', does: inserted.length === deleted.length ? 'earlier or later' : 'struck again or held', apart: round(Math.abs(inserted[0].from - deleted[0].from), 1) })
                    else record({ what: 'note', does: Math.abs(inserted[0].pitch - deleted[0].pitch) <= 2 ? 'a tone or less away' : 'another pitch', interval: Math.abs(inserted[0].pitch - deleted[0].pitch) })
                    continue
                }
                if (twinOf(note)) { record({ what: 'note', does: 'earlier or later', apart: round(Math.abs(twinOf(note).from - note.from), 1) }); continue }
                if (notesOf(theirs).some(held => held.key === note.key && held.from < note.from - 0.5 && held.to > note.from + 0.5)
                    || notesOf(mine).some(held => held.id !== note.id && held.key === note.key && held.to > note.from - 3.5 && held.from < note.from)) { record({ what: 'note', does: 'struck again or held' }); continue }
                if (alone[note.side].filter(n => n.type === 'note' && Math.abs(n.from - note.from) <= 20).length >= 5 || note.to - note.from < SHORT) { record({ what: 'note', does: 'paper' }); continue }
                const beside = alone[1 - note.side].find(n => n.type === 'note' && Math.abs(n.pitch - note.pitch) <= 2 && Math.abs(n.from - note.from) <= 5)
                if (beside) { record({ what: 'note', does: 'a tone or less away', interval: Math.abs(beside.pitch - note.pitch) }); continue }
                const around = notesOf(mine).filter(n => n.id !== note.id && Math.abs(n.from - note.from) <= 8)
                const role = around.length === 0 ? 'by itself'
                    : around.some(n => n.pitch !== note.pitch && Math.abs(n.pitch - note.pitch) % 12 === 0) ? 'octave'
                    : around.every(n => n.pitch < note.pitch) ? 'on top' : around.every(n => n.pitch > note.pitch) ? 'below' : 'within'
                // whether the same key has just been struck: a repetition one copy has a stroke more of
                const repeated = notesOf(mine).some(n => n.id !== note.id && n.pitch === note.pitch && note.from - n.from > 0 && note.from - n.from <= 60)
                // at the octave: whether it is the upper or the lower of the two
                const partner = around.find(n => n.pitch !== note.pitch && Math.abs(n.pitch - note.pitch) % 12 === 0)
                record({ what: 'note', does: 'one copy has more', role, repeated, length, pitch: note.pitch,
                         half: bar.positionOf({ type: 'note', pitch: note.pitch }) >= DIVISION ? 'treble' : 'bass',
                         ...(role === 'octave' && { doubles: note.pitch > partner.pitch ? 'above' : 'below' }),
                         chord: around.length + 1 })
                continue
            }

            if (notesOnly) continue
            const valves = [...new Set(readings.flatMap(reading => reading.valve ?? []))]
            if (valves.length === 0) { record({ what: 'other', does: 'other' }); continue }
            const pedal = readings.every(reading => reading.operates?.endsWith('Pedal'))
            const what = pedal ? (readings[0].operates === 'softPedal' ? 'soft pedal' : 'sustain pedal') : 'dynamics'
            const half = pedal ? undefined : readings[0].half
            const between = (a, b) => struck.filter(note => (!half || note.half === half) && note.from >= Math.min(a, b) && note.from <= Math.max(a, b))

            // ---- the same commands, standing elsewhere
            if (shape === 'shift' && inserted.length > 0 && deleted.length > 0) {
                const under = between(inserted[0].from, deleted[0].from)
                record({ what, does: 'timing', apart: round(Math.abs(inserted[0].from - deleted[0].from), 1), notes: under.length, half: half ?? null })
                continue
            }
            if (shape === 'unshaped' && readings.every(reading => twinOf(reading))) {
                const under = between(readings[0].from, twinOf(readings[0]).from)
                record({ what, does: 'timing', apart: round(median(readings.map(reading => Math.abs(twinOf(reading).from - reading.from))), 1), notes: under.length, half: half ?? null })
                continue
            }

            // ---- undone, with as many of the following edits on the same valve as it takes to come back
            const curve = pedal ? (readings[0].operates === 'softPedal' ? 'hammerRail' : 'damper') : half ?? 'bass'
            const threshold = pedal ? 0.5 : APART
            const group = [entry]
            let effect = undone(new Set(group.map(member => member.edit.id)), curve, threshold, half)
            while (effect.open && group.length < 4) {
                const next = edits.find(candidate => !candidate.done && !group.includes(candidate) && candidate.place > group.at(-1).place && candidate.shape !== 'shift'
                    && candidate.readings.some(reading => valves.includes(reading.valve)) && !(candidate.shape === 'unshaped' && candidate.readings.every(reading => twinOf(reading))))
                if (!next) break
                group.push(next)
                effect = undone(new Set(group.map(member => member.edit.id)), curve, threshold, half)
            }
            const scale = !effect.heard ? 'unheard' : effect.share >= 0.5 || effect.open ? 'the roll' : effect.seconds <= 1.5 ? 'accent' : effect.seconds <= 10 ? 'phrase' : 'passage'
            for (const member of group) {
                told.push({ ...branch, shape: member.shape, what, does: scale, more: effect.more, peak: effect.peak, seconds: effect.seconds, notes: effect.notes, strokes: effect.strokes,
                            melody: effect.melody, bassLine: effect.bassLine, half: half ?? null, together: group.length })
                member.done = true
            }
        }
    }
    return told
}

if (!isMainThread) {
    parentPort.postMessage(await tell(workerData))
} else {
    const rolls = readdirSync(out).filter(name => existsSync(join(out, name, 'edition.jsonld'))).map(name => +name.slice(2))
        .filter(roll => !MISALIGNED.includes(roll)).sort((a, b) => a - b)
    const waiting = [...rolls], told = []
    await Promise.all(Array.from({ length: Math.min(availableParallelism(), 8) }, async () => {
        while (waiting.length > 0) {
            const roll = waiting.shift()
            told.push(...await new Promise((done, failed) => {
                const worker = new Worker(fileURLToPath(import.meta.url), { workerData: roll, argv: process.argv.slice(2) })
                worker.once('message', done); worker.once('error', failed)
            }))
        }
    }))

    // ---- what it comes to: the classes of the expression, the classes of the notes, and the branches
    const HEARD = ['accent', 'phrase', 'passage', 'the roll']
    const classOf = edit => edit.what === 'note' ? [edit.does, edit.does === 'one copy has more' ? edit.role : null]
        : edit.what === 'dynamics' ? (HEARD.includes(edit.does) ? [edit.does === 'the roll' ? 'passage' : edit.does, edit.more ? 'more' : 'less'] : [edit.does, null])
        : HEARD.includes(edit.does) ? [edit.seconds <= 1.5 && !edit.more ? 'change' : 'held', edit.more ? 'more' : 'less'] : [edit.does, null]
    const tallied = which => {
        const groups = new Map()
        for (const edit of told.filter(which)) {
            const [does, which] = classOf(edit), key = `${edit.what === 'note' ? 'note' : edit.what}|${does}|${which ?? ''}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key).push(edit)
        }
        return [...groups].map(([key, of]) => {
            const [what, does, which] = key.split('|'), heard = of.filter(edit => edit.peak)
            const shapes = {}; for (const edit of of) shapes[edit.shape] = (shapes[edit.shape] ?? 0) + 1
            // the same again for the edits the library gives no shape, which this tells apart
            const plain = of.filter(edit => edit.shape === 'unshaped'), plainHeard = plain.filter(edit => edit.peak)
            const unshaped = plain.length === 0 ? undefined : {
                edits: plain.length, pairs: new Set(plain.map(edit => edit.roll)).size,
                ...(plainHeard.length && { peak: median(plainHeard.map(edit => edit.peak)), seconds: median(plainHeard.map(edit => edit.seconds)), notes: median(plainHeard.map(edit => edit.notes)), strokes: median(plainHeard.map(edit => edit.strokes)),
                    melody: plainHeard.filter(edit => edit.melody).length, bassLine: plainHeard.filter(edit => edit.bassLine).length, bass: plainHeard.filter(edit => edit.half === 'bass').length, treble: plainHeard.filter(edit => edit.half === 'treble').length }),
                ...(plain.some(edit => edit.apart !== undefined) && { apart: median(plain.filter(edit => edit.apart !== undefined).map(edit => edit.apart)) }),
            }
            return {
                what, does, which: which || null, edits: of.length, pairs: new Set(of.map(edit => edit.roll)).size, shapes, ...(unshaped && { unshaped }),
                ...(heard.length && { peak: median(heard.map(edit => edit.peak)), seconds: median(heard.map(edit => edit.seconds)), notes: median(heard.map(edit => edit.notes)), strokes: median(heard.map(edit => edit.strokes)),
                    melody: heard.filter(edit => edit.melody).length, bassLine: heard.filter(edit => edit.bassLine).length, bass: heard.filter(edit => edit.half === 'bass').length, treble: heard.filter(edit => edit.half === 'treble').length }),
                ...(of.some(edit => edit.apart !== undefined) && { apart: median(of.filter(edit => edit.apart !== undefined).map(edit => edit.apart)) }),
                ...(of.some(edit => edit.by !== undefined) && { by: median(of.map(edit => edit.by)) }),
                ...(of.some(edit => edit.length !== undefined) && { length: median(of.map(edit => edit.length)), repeated: of.filter(edit => edit.repeated).length, lowest: Math.min(...of.map(edit => edit.pitch)), highest: Math.max(...of.map(edit => edit.pitch)),
                    bass: of.filter(edit => edit.half === 'bass').length, treble: of.filter(edit => edit.half === 'treble').length, chord: median(of.map(edit => edit.chord)),
                    ...(of.some(edit => edit.doubles) && { above: of.filter(edit => edit.doubles === 'above').length, below: of.filter(edit => edit.doubles === 'below').length }) }),
                ...(of.some(edit => edit.interval !== undefined) && { semitone: of.filter(edit => edit.interval === 1).length, intervals: of.map(edit => edit.interval).sort((a, b) => a - b) }),
            }
        }).sort((a, b) => b.edits - a.edits)
    }

    // what a branch has of its own once timing, paper and what no note is struck under are set aside
    const weighty = edit => edit.what === 'note' ? ['one copy has more', 'another pitch'].includes(edit.does)
        : HEARD.includes(edit.does)
    const results = new Map(readFileSync(join(out, 'results.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).map(record => [record.number, record]))
    const branches = rolls.map(roll => {
        const of = told.filter(edit => edit.roll === roll)
        const names = [...new Set(of.map(edit => edit.branch))]
        return {
            roll, stemma: results.get(roll)?.proposal?.stemma ?? null,
            branches: names.map(name => {
                const own = of.filter(edit => edit.branch === name)
                return { branch: name, copy: own[0].copy, edits: own.length, weighty: own.filter(weighty).length,
                         dynamics: own.filter(edit => edit.what !== 'note' && weighty(edit)).length, notes: own.filter(edit => edit.what === 'note' && weighty(edit)).length }
            }),
        }
    })

    console.log(JSON.stringify({
        leftOut: MISALIGNED, pairs: rolls.length, edits: told.length,
        expression: { edits: told.filter(edit => edit.what !== 'note').length, classes: tallied(edit => edit.what !== 'note') },
        notes: { edits: told.filter(edit => edit.what === 'note').length, classes: tallied(edit => edit.what === 'note') },
        branches,
    }, null, 1))
}
