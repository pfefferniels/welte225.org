// What the edits of no shape do. An edit the library gives no shape puts
// one reading in or takes one out; here each is held against the text of
// the other copy, to say what it comes to on the roll:
//
//   for a command of the expression
//     twin      the other copy has the same command, up to 40 mm away
//     restates  the valve is already where the command puts it
//     departs   it switches the valve to where the other copy's is not
//     rejoins   it switches the valve to where the other copy's already is
//     other     a command that latches nothing (rewind, motor)
//   for a note
//     twin      the other copy has the same note, up to 40 mm away
//     restruck  the other copy holds one longer note through it
//     row       one of five or more within 20 mm: paper cut or torn across
//     short     a single hole under 1.5 mm long
//     own       a note the other copy has not
//
// and both copies are performed, to see what the edits of all kinds
// together do to the loudness of the notes the copies share.
//
//   node unshaped.mjs [--out out] [--linked-rolls ../../linked-rolls] > unshaped.json
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
const bar = welteT100System.trackerBar

const REACH = 40        // mm within which the same reading on the other copy is its twin
const SHORT = 1.5       // mm under which a lone hole is no note anyone meant
const median = values => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null
const round = (value, digits = 1) => value === null ? null : +value.toFixed(digits)

/** The text of a version as placed readings, in order along the roll. */
const textOf = (edition, version) => lib.snapshotOf(edition, version.id).flatMap(symbol => {
    const place = lib.placeOf(edition, symbol)
    if (!place || (symbol.type !== 'note' && symbol.type !== 'expression')) return []
    const operation = symbol.type === 'expression' ? bar.operationOf(symbol.expressionType) : undefined
    return [{
        id: symbol.id, type: symbol.type, from: place.from, to: place.to,
        key: symbol.type === 'note' ? `note ${symbol.pitch}` : `${symbol.expressionType} ${symbol.scope}`,
        name: symbol.type === 'note' ? 'note' : symbol.expressionType,
        // what a command switches: the valve of one function, on one side where the bar has two
        valve: operation && `${operation.operates}${operation.sided ? ' ' + symbol.scope : ''}`,
        operates: operation?.operates, turns: operation?.spelling,
    }]
}).sort((a, b) => a.from - b.from)

/** Where a valve stands just before a place, off where nothing has switched it yet. */
const standing = (text, valve, at) => {
    let state = 'off'
    for (const reading of text) {
        if (reading.from >= at) break
        if (reading.valve === valve) state = reading.turns
    }
    return state
}

/** What a reading that one text has and the other lacks comes to. */
const classify = (reading, own, other, alone) => {
    const twins = alone.filter(candidate => candidate.key === reading.key && Math.abs(candidate.from - reading.from) <= REACH)
    if (twins.length > 0) return { kind: 'twin', apart: Math.min(...twins.map(twin => Math.abs(twin.from - reading.from))) }

    if (reading.type === 'note') {
        if (other.some(held => held.key === reading.key && held.from < reading.from - 0.5 && held.to > reading.from + 0.5)) return { kind: 'restruck' }
        const beside = own.filter(note => note.type === 'note' && note.lone && Math.abs(note.from - reading.from) <= 20)
        if (beside.length >= 5) return { kind: 'row' }
        if (reading.to - reading.from < SHORT) return { kind: 'short' }
        return { kind: 'own', length: reading.to - reading.from }
    }

    if (!reading.valve) return { kind: 'other' }
    if (standing(own, reading.valve, reading.from) === reading.turns) return { kind: 'restates' }
    if (standing(other, reading.valve, reading.from) === reading.turns) return { kind: 'rejoins' }
    // how long the valve then stands where the other copy's does not
    const back = own.find(next => next.valve === reading.valve && next.from > reading.from && next.turns !== reading.turns)
    const follows = other.find(next => next.valve === reading.valve && next.from > reading.from && next.turns === reading.turns)
    const until = Math.min(back?.from ?? Infinity, follows?.from ?? Infinity)
    return { kind: 'departs', length: Number.isFinite(until) ? until - reading.from : null }
}

/**
 * What an edit of no shape is made of: one command, a valve let go and
 * set again (or set and let go) within the edit, one note, or notes
 * exchanged for others.
 */
const patternOf = (inserted, deleted) => {
    const all = [...inserted, ...deleted].sort((a, b) => a.from - b.from)
    const span = all.length > 1 ? all.at(-1).from - all[0].from : 0
    if (all.every(reading => reading.type === 'note')) {
        return { pattern: all.length === 1 ? (inserted.length ? 'a note put in' : 'a note taken out') : inserted.length && deleted.length ? 'notes exchanged' : 'several notes', span }
    }
    if (all.length === 1) return { pattern: inserted.length ? 'one command put in' : 'one command taken out', operates: all[0].operates ?? all[0].name, span }
    const valves = new Set(all.map(reading => reading.valve))
    if (all.length === 2 && valves.size === 1 && all[0].valve && (inserted.length === 0 || deleted.length === 0)) {
        const [first, second] = all.map(reading => reading.turns)
        if (first === 'off' && second === 'on') return { pattern: 'a valve let go and set again', operates: all[0].operates, span }
        if (first === 'on' && second === 'off') return { pattern: 'a valve set and let go', operates: all[0].operates, span }
    }
    return { pattern: 'several commands', span }
}

const rolls = []
for (const directory of readdirSync(out).filter(name => existsSync(join(out, name, 'edition.jsonld'))).sort((a, b) => a.slice(2) - b.slice(2))) {
    const edition = lib.importJsonLd(JSON.parse(readFileSync(join(out, directory, 'edition.jsonld'), 'utf8')))
    // the version each copy shows at first hand, and its text
    const shown = edition.copies.map(copy => edition.versions.find(version =>
        lib.witnessesOf(edition, version.id).some(witness => witness.copy === copy.id && !witness.through)))
    const record = { roll: +directory.slice(2), edits: [], readings: [], valves: {}, loudness: null }
    if (shown.every(Boolean) && shown[0].id !== shown[1].id) {
        const texts = shown.map(version => textOf(edition, version))
        const ids = texts.map(text => new Set(text.map(reading => reading.id)))
        texts.forEach((text, i) => text.forEach(reading => { reading.lone = !ids[1 - i].has(reading.id) }))
        const alone = texts.map(text => text.filter(reading => reading.lone))
        const byId = texts.map(text => new Map(text.map(reading => [reading.id, reading])))

        shown.forEach((version, i) => {
            if (lib.derivationsOf(version).length === 0) return
            for (const edit of version.edits) {
                if (lib.shapeOf(edition, version.id, edit)) continue
                // what the edit inserts stands in this copy's text, what it deletes in the other's
                const inserted = (edit.insert ?? []).flatMap(symbol => byId[i].get(symbol.id) ?? []).map(reading => ({ reading, side: i }))
                const deleted = (edit.delete ?? []).flatMap(id => byId[1 - i].get(id) ?? []).map(reading => ({ reading, side: 1 - i }))
                record.edits.push(patternOf(inserted.map(({ reading }) => reading), deleted.map(({ reading }) => reading)))
                for (const { reading, side } of [...inserted, ...deleted]) {
                    record.readings.push({
                        type: reading.type, name: reading.name, operates: reading.operates, turns: reading.turns,
                        does: side === i ? 'insert' : 'delete', at: round(reading.from, 0),
                        ...classify(reading, texts[side], texts[1 - side], alone[1 - side])
                    })
                }
            }
        })

        // how much of the roll each valve stands otherwise on one copy than on the other
        const onsets = texts.flat().filter(reading => reading.type === 'note').map(reading => reading.from)
        const [start, end] = [Math.min(...onsets), Math.max(...onsets)]
        for (const valve of new Set(texts.flat().flatMap(reading => reading.valve ?? []))) {
            const switches = texts.flatMap((text, i) => text.filter(reading => reading.valve === valve).map(reading => ({ at: reading.from, i, turns: reading.turns })))
                .sort((x, y) => x.at - y.at)
            const state = ['off', 'off']
            let apart = 0, last = start
            for (const change of switches) {
                const at = Math.min(Math.max(change.at, start), end)
                if (state[0] !== state[1]) apart += at - last
                state[change.i] = change.turns
                last = at
            }
            if (state[0] !== state[1]) apart += end - last
            record.valves[valve] = { apart: round(apart, 0), length: round(end - start, 0) }
        }

        // both copies performed: the loudness of every note they share
        const velocities = shown.map(version => new Map(lib.emulate(welteT100System, version, edition).events
            .filter(event => event.type === 'noteOn').map(event => [event.performs.id, event.velocity])))
        const differences = [...velocities[0]].flatMap(([id, velocity]) => velocities[1].has(id) ? [velocities[1].get(id) - velocity] : [])
        record.loudness = {
            notes: differences.length,
            meanApart: round(differences.reduce((sum, d) => sum + Math.abs(d), 0) / differences.length),
            apartBy5: differences.filter(d => Math.abs(d) >= 5).length,
            apartBy10: differences.filter(d => Math.abs(d) >= 10).length,
            secondLouderBy: round(differences.reduce((sum, d) => sum + d, 0) / differences.length),
        }
    }
    rolls.push(record)
}

const all = rolls.flatMap(roll => roll.readings.map(reading => ({ ...reading, roll: roll.roll })))
const tally = (readings, keyOf) => Object.fromEntries([...readings.reduce((counts, reading) =>
    counts.set(keyOf(reading), (counts.get(keyOf(reading)) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]))
const kinds = type => Object.entries(tally(all.filter(reading => reading.type === type), reading => reading.kind)).map(([kind, readings]) => {
    const of = all.filter(reading => reading.type === type && reading.kind === kind)
    return {
        kind, readings, pairs: new Set(of.map(reading => reading.roll)).size,
        ...(kind === 'twin' && { medianApart: round(median(of.map(reading => reading.apart))), within10: of.filter(reading => reading.apart <= 10).length }),
        ...((kind === 'departs' || kind === 'own') && { medianLength: round(median(of.filter(reading => reading.length !== null).map(reading => reading.length))) }),
        ...(type === 'expression' && { commands: tally(of, reading => reading.name) }),
        ...(type === 'note' && { most: Object.entries(tally(of, reading => reading.roll)).sort((a, b) => b[1] - a[1]).slice(0, 1).map(([roll, n]) => ({ roll: +roll, readings: n }))[0] }),
    }
})
const heard = rolls.filter(roll => roll.loudness)
const edits = rolls.flatMap(roll => roll.edits.map(edit => ({ ...edit, roll: roll.roll })))
const patterns = Object.entries(tally(edits, edit => edit.pattern)).map(([pattern, count]) => {
    const of = edits.filter(edit => edit.pattern === pattern)
    return { pattern, edits: count, pairs: new Set(of.map(edit => edit.roll)).size,
             ...(of.some(edit => edit.span > 0) && { medianSpan: round(median(of.map(edit => edit.span))) }),
             ...(of.some(edit => edit.operates) && { operates: tally(of, edit => edit.operates) }) }
})
const loudest = [...heard].sort((a, b) => b.loudness.meanApart - a.loudness.meanApart).slice(0, 6).map(roll => ({ roll: roll.roll, ...roll.loudness }))
console.log(JSON.stringify({
    edits: edits.length, patterns,
    readings: all.length,
    expression: kinds('expression'),
    note: kinds('note'),
    loudness: {
        pairs: heard.length, notes: heard.reduce((sum, roll) => sum + roll.loudness.notes, 0),
        apartBy5: heard.reduce((sum, roll) => sum + roll.loudness.apartBy5, 0), apartBy10: heard.reduce((sum, roll) => sum + roll.loudness.apartBy10, 0),
        medianMeanApart: median(heard.map(roll => roll.loudness.meanApart)), loudest,
    },
    valves: Object.fromEntries([...new Set(rolls.flatMap(roll => Object.keys(roll.valves)))].sort().map(valve => {
        const of = rolls.filter(roll => roll.valves[valve])
        const shares = of.map(roll => 100 * roll.valves[valve].apart / roll.valves[valve].length)
        return [valve, { pairs: of.length, apart: round(100 * of.reduce((sum, roll) => sum + roll.valves[valve].apart, 0) / of.reduce((sum, roll) => sum + roll.valves[valve].length, 0)),
                         medianApart: round(median(shares)), most: round(Math.max(...shares)), mostIn: of[shares.indexOf(Math.max(...shares))].roll }]
    })),
    rolls: rolls.map(roll => ({ roll: roll.roll, loudness: roll.loudness, valves: roll.valves, kinds: tally(roll.readings, reading => `${reading.type} ${reading.kind}`),
                                departs: tally(roll.readings.filter(reading => reading.kind === 'departs'), reading => reading.name) })),
}, null, 1))
