// What the edits do to the dynamics. Both copies of a pair are performed
// on the library's emulation of the red Welte, which yields for each half
// of the keyboard a curve on the roll's own ruled scale, 0 at P.P., 0.5
// at M.F., 1 at F.F. Where the two curves part by a fifth of a marking
// or more (a marking being a quarter of the scale: pp, p, mf, f, ff), that
// is an episode: how long it lasts, how far the curves part, which copy
// is the louder, which notes are struck under it, and which edits stand
// before it.
//
//   node dynamics.mjs [--out out] [--linked-rolls ../../linked-rolls] > dynamics.json
//
// The second copy is held against the first in the order they were
// punched where `dates.json` has both dates, otherwise as they are named.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) =>
    arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []))
const libraryAt = resolve(args['linked-rolls'] ?? join(here, '../../linked-rolls'))
const lib = await import(pathToFileURL(join(libraryAt, 'lib/index.js')).href)
const { welteT100System } = await import(pathToFileURL(join(libraryAt, 'lib/systems/welteT100/system.js')).href)
const out = resolve(here, args.out ?? 'out')
const dated = existsSync(join(here, 'dates.json')) ? new Map(JSON.parse(readFileSync(join(here, 'dates.json'), 'utf8')).pairs.map(pair => [pair.wm, pair])) : new Map()

const MARKING = 0.25      // one marking on the ruled scale: pp to p, p to mf, and so on
const APART = 0.05        // a fifth of a marking: where two curves count as parted
const STEP = 2            // mm between the places the curves are compared at
const JOIN = 15           // mm of agreement that two partings of one sign may hold between them
const LEAD = 300          // mm before an episode within which an edit can be its cause
const DIVISION = 54       // the track from which notes follow the treble expression
const HALVES = ['bass', 'treble']
const median = values => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null
const round = (value, digits = 2) => value === null || value === undefined ? null : +value.toFixed(digits)
const day = iso => iso ? Date.parse(iso + (iso.length === 4 ? '-07-01' : iso.length === 7 ? '-01' : '')) : null

/** A curve read at any place along the roll. */
const reader = (curve, of) => {
    let i = 0
    return place => {
        while (i + 1 < curve.place.length && curve.place[i + 1] <= place) i++
        while (i > 0 && curve.place[i] > place) i--
        return of[i]
    }
}

/** The length of an episode, as music: an accent, a phrase, a passage, or the roll. */
const scaleOf = (seconds, share) => share >= 0.5 ? 'the roll' : seconds <= 1.5 ? 'accent' : seconds <= 10 ? 'phrase' : 'passage'

const pairs = []
for (const directory of readdirSync(out).filter(name => existsSync(join(out, name, 'edition.jsonld'))).sort((a, b) => a.slice(2) - b.slice(2))) {
    const edition = lib.importJsonLd(JSON.parse(readFileSync(join(out, directory, 'edition.jsonld'), 'utf8')))
    const roll = +directory.slice(2)
    const shown = edition.copies.map(copy => edition.versions.find(version =>
        lib.witnessesOf(edition, version.id).some(witness => witness.copy === copy.id && !witness.through)))
    if (!shown.every(Boolean) || shown[0].id === shown[1].id) { pairs.push({ roll, sameText: true, episodes: [] }); continue }

    // the earlier punched copy first, where both dates are read
    const dates = dated.get(roll)?.dates ?? []
    const byDate = dates.every(Boolean) && day(dates[0]) !== day(dates[1])
    const order = byDate && day(dates[0]) > day(dates[1]) ? [1, 0] : [0, 1]
    const sigla = order.map(i => edition.copies[i].siglum)
    const performed = order.map(i => lib.emulate(welteT100System, shown[i], edition))
    const notes = performed.map(emulated => emulated.events.filter(event => event.type === 'noteOn').map(event => ({
        id: event.performs.id, pitch: event.pitch, velocity: event.velocity, at: event.at, place: event.performs.horizontal.from,
        half: event.performs.vertical.from >= DIVISION ? 'treble' : 'bass',
    })))
    const struck = notes.map(list => new Map(list.map(note => [note.id, note])))
    const all = [...notes[0], ...notes[1].filter(note => !struck[0].has(note.id))].sort((a, b) => a.place - b.place)
    const [start, end] = [all[0].place - 20, all.at(-1).place + 20]

    // the top of the texture: the highest note among those struck within 8 mm of it
    all.forEach((note, i) => {
        let top = true
        for (let j = i - 1; j >= 0 && note.place - all[j].place <= 8; j--) if (all[j].pitch > note.pitch) top = false
        for (let j = i + 1; j < all.length && all[j].place - note.place <= 8; j++) if (all[j].pitch > note.pitch) top = false
        note.top = top
        let bottom = true
        for (let j = i - 1; j >= 0 && note.place - all[j].place <= 8; j--) if (all[j].pitch < note.pitch) bottom = false
        for (let j = i + 1; j < all.length && all[j].place - note.place <= 8; j++) if (all[j].pitch < note.pitch) bottom = false
        note.bottom = bottom
    })

    // the edits of both versions that touch the expression of one half, by place
    const edits = order.flatMap(i => lib.derivationsOf(shown[i]).length === 0 ? [] : shown[i].edits.flatMap(edit => {
        const inserted = new Map(edition.versions.flatMap(version => version.edits.flatMap(e => e.insert ?? [])).map(symbol => [symbol.id, symbol]))
        const symbols = [...(edit.insert ?? []), ...(edit.delete ?? []).flatMap(id => inserted.get(id) ?? [])].filter(symbol => symbol.type === 'expression')
        const places = symbols.flatMap(symbol => lib.placeOf(edition, symbol)?.from ?? [])
        const halves = [...new Set(symbols.map(symbol => symbol.scope))].filter(scope => HALVES.includes(scope))
        const operates = [...new Set(symbols.flatMap(symbol => welteT100System.trackerBar.operationOf(symbol.expressionType)?.operates ?? []))]
        if (places.length === 0) return []
        return [{ shape: lib.shapeOf(edition, shown[i].id, edit) ?? 'unshaped', place: Math.min(...places), halves, operates, pedal: operates.some(o => o.endsWith('Pedal')), episode: null }]
    }))

    const episodes = []
    const apartOver = {}
    for (const half of HALVES) {
        const curves = performed.map(emulated => emulated.curves.find(curve => curve.kind === 'dynamics' && curve.name === half))
        const travel = curves.map(curve => reader(curve, curve.travel)), seconds = reader(curves[0], curves[0].seconds)
        const places = [], difference = [], levels = []
        for (let place = start; place <= end; place += STEP) {
            const [a, b] = travel.map(read => read(place))
            places.push(place); difference.push(b - a); levels.push([a, b])
        }
        apartOver[half] = round(difference.filter(d => Math.abs(d) >= APART).length / difference.length, 3)

        // runs where the curves stand apart, of one sign, joined across a short agreement
        const runs = []
        for (let i = 0; i < difference.length; i++) {
            if (Math.abs(difference[i]) < APART) continue
            const sign = Math.sign(difference[i]), last = runs.at(-1)
            if (last && last.sign === sign && places[i] - places[last.to] <= JOIN) last.to = i
            else runs.push({ from: i, to: i, sign })
        }
        for (const run of runs) {
            const [from, to] = [places[run.from], places[run.to]]
            const under = all.filter(note => note.half === half && note.place >= from && note.place <= to)
            if (under.length === 0) continue                    // the curves part where nothing is struck
            const inside = difference.slice(run.from, run.to + 1)
            const peakAt = inside.reduce((best, d, i) => Math.abs(d) > Math.abs(inside[best]) ? i : best, 0)
            const duration = seconds(to) - seconds(from)
            const shared = under.filter(note => struck[0].has(note.id) && struck[1].has(note.id))
            const episode = {
                half, from: round(from, 0), to: round(to, 0), seconds: round(duration, 1),
                scale: scaleOf(duration, (to - from) / (end - start)),
                louder: run.sign > 0 ? sigla[1] : sigla[0], sign: run.sign,
                peak: round(Math.abs(inside[peakAt]) / MARKING), mean: round(inside.reduce((sum, d) => sum + Math.abs(d), 0) / inside.length / MARKING),
                // where the peak lies in the episode, and how much of it stands near the peak: a swell or a level
                peakAt: round(inside.length > 1 ? peakAt / (inside.length - 1) : 0.5), held: round(inside.filter(d => Math.abs(d) >= 0.7 * Math.abs(inside[peakAt])).length / inside.length),
                // the level the first copy stands at there, and the second
                level: levels.slice(run.from, run.to + 1).reduce((sum, [a, b]) => [sum[0] + a, sum[1] + b], [0, 0]).map(sum => round(sum / inside.length)),
                notes: under.length, top: under.filter(note => note.top).length, bottom: under.filter(note => note.bottom).length,
                // how many times the hand comes down: notes struck within 8 mm of each other are one stroke
                strokes: under.reduce((strokes, note, i) => i === 0 || note.place - under[i - 1].place > 8 ? strokes + 1 : strokes, 0),
                at: round(((from + to) / 2 - start) / (end - start)),
                lowest: Math.min(...under.map(note => note.pitch)), highest: Math.max(...under.map(note => note.pitch)),
                velocity: shared.length ? round(shared.reduce((sum, note) => sum + (struck[1].get(note.id).velocity - struck[0].get(note.id).velocity), 0) / shared.length, 1) : null,
                edits: {},
            }
            // away from the middle of the scale, or towards it: more contrast in the second copy, or less
            episode.contrast = Math.abs(episode.level[1] - 0.5) > Math.abs(episode.level[0] - 0.5) ? 'more' : 'less'
            episodes.push(episode)
        }
    }

    // whether the other half of the keyboard goes the same way at the same time
    for (const episode of episodes) {
        episode.together = episodes.some(other => other.half !== episode.half && other.sign === episode.sign && other.from <= episode.to && other.to >= episode.from)
    }

    // an edit is heard in the first episode of its half that begins no more than LEAD after it
    for (const edit of edits) {
        if (edit.pedal && edit.halves.length === 0) continue
        const candidates = episodes.filter(episode => (edit.halves.length === 0 || edit.halves.includes(episode.half)) && edit.place >= episode.from - LEAD && edit.place <= episode.to)
        const episode = candidates.sort((a, b) => Math.abs(a.from - edit.place) - Math.abs(b.from - edit.place))[0]
        if (episode) { episode.edits[edit.shape] = (episode.edits[edit.shape] ?? 0) + 1; edit.episode = episode }
    }

    // how wide each copy plays: the levels a tenth and nine tenths of its notes lie under
    const span = notes.map((list, i) => {
        const levels = list.map(note => reader(performed[i].curves.find(curve => curve.kind === 'dynamics' && curve.name === note.half), performed[i].curves.find(curve => curve.kind === 'dynamics' && curve.name === note.half).travel)(note.place)).sort((a, b) => a - b)
        return { low: round(levels[Math.floor(0.1 * levels.length)]), high: round(levels[Math.floor(0.9 * levels.length)]), mean: round(levels.reduce((a, b) => a + b, 0) / levels.length) }
    })

    pairs.push({
        roll, sigla, byDate, dates: order.map(i => dates[i] ?? null),
        notes: all.length, seconds: round(performed[0].events.at(-1).at, 0), length: round(end - start, 0),
        apartOver, span,
        under: new Set(episodes.flatMap(episode => all.filter(note => note.half === episode.half && note.place >= episode.from && note.place <= episode.to).map(note => note.id))).size,
        edits: edits.filter(edit => !edit.pedal).map(edit => ({ shape: edit.shape, operates: edit.operates.join('+'), heard: Boolean(edit.episode), scale: edit.episode?.scale ?? null, peak: edit.episode?.peak ?? null })),
        pedalEdits: edits.filter(edit => edit.pedal).length,
        episodes,
        // the curves themselves, thinned, for drawing
        drawn: Object.fromEntries(HALVES.map(half => [half, performed.map(emulated => {
            const curve = emulated.curves.find(c => c.kind === 'dynamics' && c.name === half)
            const points = []
            for (let i = 0; i < curve.place.length; i += 12) points.push([round(curve.place[i], 1), round(curve.seconds[i], 2), round(curve.travel[i], 3)])
            return points
        })])),
        struck: all.map(note => ({ place: note.place, pitch: note.pitch, half: note.half, top: note.top, bottom: note.bottom })),
    })
}
// ---- what it comes to, over all pairs

// WM 662 is left out of the sums: its first two metres do not align, and what parts there is the alignment's
const MISALIGNED = [662]
const catalogue = new Map(JSON.parse(readFileSync(join(here, 'rolls.json'), 'utf8')).map(roll => [roll.number, roll]))
const held = pairs.filter(pair => !pair.sameText && !MISALIGNED.includes(pair.roll))
const episodes = held.flatMap(pair => pair.episodes.map(episode => ({ ...episode, roll: pair.roll, byDate: pair.byDate, sigla: pair.sigla })))
const share = (part, whole) => whole ? round(100 * part / whole, 1) : null
const SCALES = ['accent', 'phrase', 'passage', 'the roll']

const scales = SCALES.map(scale => {
    const of = episodes.filter(episode => episode.scale === scale)
    return of.length === 0 ? { scale, places: 0 } : {
        scale, places: of.length, pairs: new Set(of.map(episode => episode.roll)).size,
        seconds: median(of.map(episode => episode.seconds)), peak: median(of.map(episode => episode.peak)),
        notes: median(of.map(episode => episode.notes)), strokes: median(of.map(episode => episode.strokes)),
        notesUnder: of.reduce((sum, episode) => sum + episode.notes, 0),
        oneStroke: of.filter(episode => episode.strokes === 1).length,
        bass: of.filter(episode => episode.half === 'bass').length, treble: of.filter(episode => episode.half === 'treble').length,
        // a treble episode that takes in the top of the texture, a bass one that takes in the bottom
        melody: of.filter(episode => episode.half === 'treble' && episode.top > 0).length,
        bassLine: of.filter(episode => episode.half === 'bass' && episode.bottom > 0).length,
        together: of.filter(episode => episode.together).length,
        swells: of.filter(episode => episode.held < 0.5 && episode.peakAt > 0.2 && episode.peakAt < 0.8).length,
        levels: of.filter(episode => episode.held >= 0.5).length,
    }
})

// where in the piece: by fifths of the roll
const fifths = [0, 1, 2, 3, 4].map(i => episodes.filter(episode => Math.min(4, Math.floor(episode.at * 5)) === i).length)

// the later punched copy against the earlier, where both are dated
const timed = held.filter(pair => pair.byDate)
const later = {
    pairs: timed.length,
    differing: timed.filter(pair => pair.episodes.length > 0).length,
    louder: episodes.filter(episode => episode.byDate && episode.sign > 0).length,
    softer: episodes.filter(episode => episode.byDate && episode.sign < 0).length,
    // the soft and the loud end of what each copy plays, and its middle
    softEndRaised: timed.filter(pair => pair.span[1].low - pair.span[0].low >= 0.02).length,
    softEndLowered: timed.filter(pair => pair.span[0].low - pair.span[1].low >= 0.02).length,
    loudEndRaised: timed.filter(pair => pair.span[1].high - pair.span[0].high >= 0.02).length,
    loudEndLowered: timed.filter(pair => pair.span[0].high - pair.span[1].high >= 0.02).length,
    middleRaised: timed.filter(pair => pair.span[1].mean - pair.span[0].mean >= 0.02).length,
    middleLowered: timed.filter(pair => pair.span[0].mean - pair.span[1].mean >= 0.02).length,
    spans: timed.filter(pair => pair.episodes.length > 0).map(pair => ({ roll: pair.roll, sigla: pair.sigla, dates: pair.dates, earlier: pair.span[0], later: pair.span[1] })),
}

// what each kind of edit is heard as
const edits = held.flatMap(pair => pair.edits)
const kinds = [...new Set(edits.map(edit => edit.shape))].map(shape => {
    const of = edits.filter(edit => edit.shape === shape), heard = of.filter(edit => edit.heard)
    return { shape, edits: of.length, heard: heard.length, ...Object.fromEntries(SCALES.map(scale => [scale, heard.filter(edit => edit.scale === scale).length])), peak: median(heard.map(edit => edit.peak)) }
}).sort((a, b) => b.edits - a.edits)

// examples to draw: one stretch of curve for each kind of thing that happens
const excerpt = (pair, episode, margin = 90, least = 420) => {
    const middle = (episode.from + episode.to) / 2, half = Math.max((episode.to - episode.from) / 2 + margin, least / 2)
    const [from, to] = [middle - half, middle + half]
    const within = points => points.filter(([place]) => place >= from && place <= to)
    const thin = points => points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 260)) === 0).map(([, seconds, travel]) => [seconds, travel])
    const curves = pair.drawn[episode.half].map(points => thin(within(points)))
    const clock = pair.drawn[episode.half][0]
    const secondsAt = place => (clock.find(([p]) => p >= place) ?? clock.at(-1))[1]
    const level = (i, place) => (pair.drawn[episode.half][i].find(([p]) => p >= place) ?? pair.drawn[episode.half][i].at(-1))[2]
    const title = catalogue.get(pair.roll)
    return {
        roll: pair.roll, composer: (title?.composer ?? '').split(',')[0], title: title?.title ?? '', pianist: (title?.performer ?? '').split(',')[0],
        sigla: pair.sigla, dates: pair.dates, byDate: pair.byDate, half: episode.half,
        episode: { from: secondsAt(episode.from), to: secondsAt(episode.to), louder: episode.louder, peak: episode.peak, notes: episode.notes, strokes: episode.strokes, seconds: episode.seconds, scale: episode.scale, edits: episode.edits },
        window: [secondsAt(from), secondsAt(to)],
        curves,
        notes: pair.struck.filter(note => note.half === episode.half && note.place >= from && note.place <= to)
            .map(note => [secondsAt(note.place), level(0, note.place), level(1, note.place), note.pitch, (episode.half === 'treble' ? note.top : note.bottom) ? 1 : 0]),
    }
}
const pick = (test, score) => {
    const found = held.flatMap(pair => pair.episodes.filter(test).map(episode => ({ pair, episode }))).sort((a, b) => score(b.episode) - score(a.episode))
    return found
}
const taken = new Set()
const example = (name, test, score, margin, least) => {
    const found = pick(test, score).find(({ pair }) => !taken.has(pair.roll))
    if (!found) return []
    taken.add(found.pair.roll)
    return [{ name, ...excerpt(found.pair, found.episode, margin, least) }]
}
// each example is the place of its kind nearest a size that is plain to see without being the extreme
const near = target => episode => -Math.abs(episode.peak - target)
const cause = episode => Object.keys(episode.edits).length > 0
const examples = [
    ...example('roll', episode => episode.scale === 'the roll' && episode.half === 'treble', episode => episode.peak, 0, 0),
    ...example('melody', episode => episode.scale === 'accent' && episode.half === 'treble' && episode.strokes === 1 && episode.top > 0 && !episode.together && cause(episode), near(1.5)),
    ...example('bass', episode => episode.scale === 'accent' && episode.half === 'bass' && episode.strokes === 1 && episode.bottom > 0 && !episode.together && cause(episode), near(1.5)),
    ...example('swell', episode => episode.scale === 'phrase' && episode.held < 0.45 && episode.peakAt > 0.3 && episode.peakAt < 0.7 && episode.notes >= 10 && cause(episode), near(1.5)),
    ...example('passage', episode => episode.scale === 'passage' && episode.notes >= 30, episode => episode.seconds, 120),
]

// and one stretch where one copy brings out beat after beat: the eight seconds with the most accents in one half
const beats = held.flatMap(pair => HALVES.flatMap(half => {
    const accents = pair.episodes.filter(episode => episode.half === half && episode.scale === 'accent').sort((a, b) => a.from - b.from)
    return accents.map((first, i) => {
        const run = accents.slice(i).filter(episode => episode.to <= first.from + 420)
        return { pair, half, run, sameWay: run.filter(episode => episode.sign === first.sign).length }
    })
})).filter(({ pair, run, sameWay }) => !taken.has(pair.roll) && sameWay === run.length).sort((a, b) => b.run.length - a.run.length)[0]
if (beats) {
    const { pair, run } = beats
    const whole = { ...run[0], to: run.at(-1).to, notes: run.reduce((sum, episode) => sum + episode.notes, 0), strokes: run.reduce((sum, episode) => sum + episode.strokes, 0),
                    peak: median(run.map(episode => episode.peak)), edits: run.reduce((all, episode) => { for (const [shape, n] of Object.entries(episode.edits)) all[shape] = (all[shape] ?? 0) + n; return all }, {}) }
    const drawn = excerpt(pair, whole, 40, 0)
    examples.push({ name: 'beats', ...drawn, accents: run.length, spans: run.map(episode => [drawn.window[0] + (episode.from - (whole.from - 40)) / (whole.to - whole.from + 80) * (drawn.window[1] - drawn.window[0]), drawn.window[0] + (episode.to - (whole.from - 40)) / (whole.to - whole.from + 80) * (drawn.window[1] - drawn.window[0])].map(v => round(v))) })
}

const notes = held.reduce((sum, pair) => sum + pair.notes, 0), under = held.reduce((sum, pair) => sum + pair.under, 0)
console.log(JSON.stringify({
    marking: 'a quarter of the ruled scale: pp, p, mf, f, ff', apart: APART / MARKING,
    leftOut: MISALIGNED,
    pairs: held.length, alike: held.filter(pair => pair.episodes.length === 0).length, sameText: pairs.filter(pair => pair.sameText).map(pair => pair.roll),
    notes, under, share: share(under, notes),
    places: episodes.length, scales, fifths, later, kinds,
    rolls: pairs.filter(pair => !pair.sameText).map(pair => ({
        roll: pair.roll, sigla: pair.sigla, byDate: pair.byDate, notes: pair.notes, under: pair.under, share: share(pair.under, pair.notes),
        apartOver: pair.apartOver, span: pair.span, places: Object.fromEntries(SCALES.map(scale => [scale, pair.episodes.filter(episode => episode.scale === scale).length])),
    })),
    examples,
}, null, 1))
