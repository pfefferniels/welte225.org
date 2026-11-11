// The whole cycle on one roll, without the desk: read the copies, give
// each a version, align them, propose a stemma and its edits, adopt both,
// perform every version and write the edition out. The sequence is the
// one Roll Desk runs when a copy is added (`createVersion`, `nameCopy`,
// `alignCopy`) and when a proposal is adopted (`adoptStemma`,
// `adoptEdits`), so what fails here fails there.
//
//   node cycle.mjs --rolls rolls.json --out out [--only 1213,371] [--linked-rolls ../../linked-rolls]
//
// `rolls.json` lists the rolls, each with its copies and the file each is
// read from (see `pairs.py`). One JSON line per roll goes to
// `<out>/results.jsonl`; the editions and the MIDI go beside it.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) =>
    arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []))
const libraryAt = resolve(args['linked-rolls'] ?? join(here, '../../linked-rolls'))
const out = resolve(args.out ?? join(here, 'out'))
const only = args.only?.split(',')

const lib = await import(pathToFileURL(join(libraryAt, 'lib/index.js')).href)
const { validate } = await import(pathToFileURL(join(libraryAt, 'lib/validate.js')).href)
const systems = {
    'welte-t100': (await import(pathToFileURL(join(libraryAt, 'lib/systems/welteT100/system.js')).href)).welteT100System,
    'welte-t98': (await import(pathToFileURL(join(libraryAt, 'lib/systems/welteT98/system.js')).href)).welteT98System,
    'welte-licensee': (await import(pathToFileURL(join(libraryAt, 'lib/systems/welteLicensee/system.js')).href)).welteLicenseeSystem
}
const requireFromLibrary = createRequire(join(libraryAt, 'package.json'))
const { produce } = requireFromLibrary('immer')
const { write: writeMidi } = requireFromLibrary('midifile-ts')
const { paperAt, WELTE_SPOOL } = await import(pathToFileURL(requireFromLibrary.resolve('welte-mignon-emulator')).href)

/** Where the paper had run after so many seconds on the Welte spool, as the desk's dialog places an e-roll. */
const placeOnPaper = elapsed => lib.mm(paperAt(WELTE_SPOOL, elapsed) * 10)

const bars = { 'welte-t100': lib.welteT100, 'welte-t98': lib.welteT98, 'welte-licensee': lib.welteLicensee }

const bytesOf = path => path.endsWith('.bz2')
    ? execFileSync('bzip2', ['-dc', path], { maxBuffer: 1 << 30 })
    : readFileSync(path)

/**
 * A copy read from its file by the reader its extension names, as the
 * desk's dialog chooses it. An e-roll's seconds are put onto the paper
 * by the Welte spool, as the dialog does, unless the list says the file
 * runs at a constant speed (`paper: 'constant'`).
 */
const readCopy = ({ file, system = 'welte-t100', paper = 'spool' }) => {
    const bar = bars[system]
    const name = file.replace(/\.bz2$/, '')
    const bytes = bytesOf(file)
    if (name.endsWith('.txt')) return lib.readFromStanfordAton(bytes.toString('utf8'), { system: bar })
    if (name.endsWith('.bar')) return lib.readFromSpencerBar(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { system: bar })
    if (name.endsWith('.mid')) return lib.readFromPhillipsEroll(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { system: bar, ...(paper === 'spool' && { placeAt: placeOnPaper }) })
    throw new Error(`no reader for ${file}`)
}

const emptyEdition = roll => ({
    versions: [],
    copies: [],
    title: `Welte-Mignon ${roll.number}`,
    license: '',
    base: `https://example.org/wm${roll.number}/`,
    creation: { editors: [], publisher: { name: '', sameAs: [] }, publicationDate: new Date('2026-11-11') },
    roll: {
        catalogueNumber: String(roll.number),
        recordingEvent: {
            recorded: { pianist: { name: roll.performer ?? '', sameAs: [] }, playing: roll.title ?? '' },
            date: lib.assignDate(new Date('1905-01-01')),
            place: { name: '', sameAs: [] }
        }
    }
})

/** A value as text with its keys in order, so that two values saying the same read the same. */
const canonical = value => JSON.stringify(value, (_, inner) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
        ? Object.fromEntries(Object.keys(inner).sort().map(key => [key, inner[key]]))
        : inner)

/** Where two values first differ, as a path and what stands there in each. */
const firstDifference = (a, b, path = '') => {
    if (canonical(a) === canonical(b)) return undefined
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
            const found = firstDifference(a[key], b[key], `${path}/${key}`)
            if (found) return found
        }
    }
    return { path, wrote: JSON.stringify(a)?.slice(0, 120), reread: JSON.stringify(b)?.slice(0, 120) }
}

/**
 * Among readings each on one copy alone, how many pair up with one of
 * the same meaning on the other copy within reach, nearest first, and
 * how many stay alone, apart by kind.
 */
const displacedAmong = (alone, reach = 40) => {
    const candidates = []
    const byKey = Map.groupBy(alone, reading => reading.key)
    for (const readings of byKey.values()) {
        for (const a of readings) for (const b of readings) {
            if (a.copies[0] < b.copies[0] && Math.abs(a.place.from - b.place.from) <= reach) {
                candidates.push({ a, b, apart: Math.abs(a.place.from - b.place.from) })
            }
        }
    }
    const taken = new Set()
    let pairs = 0
    for (const { a, b } of candidates.sort((x, y) => x.apart - y.apart)) {
        if (taken.has(a) || taken.has(b)) continue
        taken.add(a).add(b)
        pairs++
    }
    const left = alone.filter(reading => !taken.has(reading))
    return { pairs, left: left.length, leftByKind: tally(left.map(reading => reading.meaning.type)) }
}

const timed = run => {
    const from = performance.now()
    const value = run()
    return [value, Math.round(performance.now() - from)]
}

const tally = values => values.reduce((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {})
const round = (value, places = 3) => value === undefined ? undefined : Math.round(value * 10 ** places) / 10 ** places

/** One step of the cycle: what it found, or how it failed. The cycle goes on where it can. */
const step = (record, name, run) => {
    try {
        const [value, ms] = timed(run)
        record.ms[name] = ms
        return value
    } catch (error) {
        record.errors.push({ step: name, message: error.message, at: (error.stack ?? '').split('\n').slice(1, 4).map(line => line.trim()) })
        return undefined
    }
}

const cycle = roll => {
    const record = { number: roll.number, title: roll.title, performer: roll.performer, ms: {}, errors: [], copies: [] }
    const directory = join(out, `wm${roll.number}`)
    rmSync(directory, { recursive: true, force: true })
    mkdirSync(directory, { recursive: true })

    let edition = emptyEdition(roll)
    const names = new Map()

    for (const source of roll.copies) {
        const copy = step(record, `read ${source.siglum}`, () => readCopy(source))
        if (!copy) continue
        names.set(copy.id, source.siglum)
        const features = lib.featuresOf(copy)
        record.copies.push({
            siglum: source.siglum,
            source: source.id,
            features: tally(features.map(feature => feature.type)),
            tears: copy.conditions?.length
        })
        // As the desk's dialog does on upload, in one step.
        const next = step(record, `add ${source.siglum}`, () => produce(edition, draft => {
            lib.createVersion(copy)(draft)
            lib.nameCopy(copy.id, source.siglum)(draft)
            lib.alignCopy(copy.id)(draft)
        }))
        if (next) edition = next
        const alignment = edition.copies.find(c => c.id === copy.id)?.measurements?.alignment
        record.copies.at(-1).alignment = alignment && {
            against: names.get(alignment.against),
            matched: alignment.matched,
            shift: round(alignment.shift?.horizontal),
            scale: round(alignment.scale, 5),
            scaleError: round(alignment.scaleError, 6),
            residual: round(alignment.residual)
        }
    }

    // How many chains the copies differ by, track for track, whatever their places: what no alignment can add to or take from.
    record.chainsApart = step(record, 'chainsApart', () => {
        const counts = edition.copies.map(copy => tally(lib.featuresOf(copy).filter(feature => feature.type === 'HoleChain').map(feature => feature.vertical.from)))
        const tracks = [...new Set(counts.flatMap(Object.keys))]
        return edition.copies.flatMap((a, i) => edition.copies.slice(i + 1).map((b, j) => ({
            copies: [names.get(a.id), names.get(b.id)],
            chains: tracks.reduce((sum, t) => sum + Math.abs((counts[i][t] ?? 0) - (counts[i + 1 + j][t] ?? 0)), 0)
        })))
    })

    record.alignmentProblems = step(record, 'alignmentProblems', () =>
        lib.alignmentProblems(edition).map(problem => ({ ...problem, copy: names.get(problem.copy) })))

    const named = ids => ids.map(id => names.get(id) ?? id)
    const proposal = step(record, 'proposeStemma', () => lib.proposeStemma(edition))
    if (proposal) {
        record.proposal = {
            notation: proposal.notation,
            cost: round(proposal.cost),
            scored: proposal.scored,
            readings: proposal.collation.readings.length,
            shared: proposal.collation.readings.filter(reading => reading.copies.length > 1).length,
            only: tally(proposal.collation.readings.filter(reading => reading.copies.length === 1).map(reading => names.get(reading.copies[0]))),
            onlyByKind: tally(proposal.collation.readings.filter(reading => reading.copies.length === 1).map(reading => reading.meaning.type === 'note' ? 'note' : reading.meaning.type)),
            // What the window between the copies admits at either end of a reading, in millimetres.
            windows: Object.values(proposal.collation.windows).map(window => ({
                n: window.n, start: round(window.toleranceStart, 2), end: round(window.toleranceEnd, 2),
                offsetStart: round(window.offsetStart ?? 0, 2), offsetEnd: round(window.offsetEnd ?? 0, 2)
            })),
            // Readings of one copy alone that have a reading of the same meaning on the other copy alone within 40 mm: one hole read twice, the copies lying further apart there than the window admits.
            displaced: displacedAmong(proposal.collation.readings.filter(reading => reading.copies.length === 1)),
            texts: proposal.texts.map(text => ({ copies: named(text.copies), differences: text.differences })),
            apart: proposal.apart.map(pair => ({ copies: named(pair.copies), differences: pair.differences })),
            alternatives: proposal.alternatives.map(other => ({ notation: other.notation, cost: round(other.cost), lost: other.lost })),
            supports: proposal.supports.map(support => ({ copies: named(support.copies), ancestor: support.ancestor && named(support.ancestor), margin: round(support.margin) })),
            conflicts: proposal.conflicts.length,
            baseText: proposal.baseText.length,
            versions: proposal.versions.map(version => ({ id: version.id, copies: named(version.copies), parent: version.parent, system: version.system }))
        }
        const adopted = step(record, 'adopt', () => produce(edition, draft => {
            lib.adoptStemma(proposal)(draft)
            lib.adoptEdits()(draft)
        }))
        if (adopted) edition = adopted
    }

    const sigla = step(record, 'siglaOf', () => lib.siglaOf(edition)) ?? new Map()
    record.versions = edition.versions.map(version => {
        const siglum = sigla.get(version.id) ?? version.id
        const edits = lib.editsOf(version)
        const entry = {
            siglum,
            system: version.system?.name ?? version.system?.id,
            derivesFrom: step(record, `derivationsOf ${siglum}`, () => lib.derivationsOf(version).map(derivation => sigla.get(derivation.parent) ?? derivation.parent)),
            witnesses: step(record, `witnessesOf ${siglum}`, () => lib.witnessesOf(edition, version.id).map(witness => `${names.get(witness.copy) ?? witness.copy}${witness.through ? ` through ${sigla.get(witness.through) ?? witness.through}` : ''}`)),
            edits: edits.length,
            inserts: edits.reduce((sum, edit) => sum + (edit.insert?.length ?? 0), 0),
            deletes: edits.reduce((sum, edit) => sum + (edit.delete?.length ?? 0), 0),
            motivations: tally(edits.map(edit => edit.motivation ? String(lib.idOf(edit.motivation)).replace(/^.*[/#]/, '') : 'none')),
            shapes: step(record, `shapes ${siglum}`, () => tally(edits.map(edit => lib.shapeOf(edition, version.id, edit) ?? 'unshaped'))),
            symbols: step(record, `snapshotOf ${siglum}`, () => lib.snapshotOf(edition, version.id).length)
        }
        const system = systems[lib.trackerBarOf?.(version.system)?.id ?? 'welte-t100']
        const emulated = step(record, `emulate ${siglum}`, () => lib.emulate(system, version, edition))
        if (emulated) {
            const onsets = emulated.events.filter(event => event.type === 'noteOn')
            entry.performed = {
                notes: onsets.length,
                seconds: round(emulated.events.at(-1)?.at ?? 0, 1),
                velocities: onsets.length > 0 ? [Math.min(...onsets.map(e => e.velocity)), Math.max(...onsets.map(e => e.velocity))] : undefined
            }
            step(record, `midi ${siglum}`, () => {
                const midi = lib.midiOf(emulated.events, system.name, system.defaultOptions, emulated.source)
                const bytes = writeMidi(midi.tracks, midi.header.ticksPerBeat)
                writeFileSync(join(directory, `${siglum.replace(/[^\w.-]+/g, '_')}.mid`), bytes)
                entry.performed.midiBytes = bytes.length
            })
        }
        return entry
    })

    record.constraints = step(record, 'constraintProblems', () => tally(lib.constraintProblems(edition).map(problem => problem.problem ?? problem.type ?? 'problem')))
    record.carriage = step(record, 'carriageProblems', () => tally(lib.carriageProblems(edition).map(problem => problem.problem ?? problem.type ?? 'problem')))

    const document = step(record, 'asJsonLd', () => lib.asJsonLd(edition))
    if (document) {
        const text = JSON.stringify(document, null, 2)
        writeFileSync(join(directory, 'edition.jsonld'), text)
        record.document = { bytes: text.length }
        step(record, 'validate', () => {
            record.document.valid = validate(JSON.parse(text))
            if (!record.document.valid) record.document.faults = (validate.errors ?? []).slice(0, 8).map(fault => `${fault.instancePath}: ${fault.message}`)
        })
        step(record, 'round trip', () => {
            // Read back and written again, the document says the same; the order of keys is not part of what it says.
            const again = lib.asJsonLd(lib.importJsonLd(JSON.parse(text)))
            const [wrote, reread] = [canonical(JSON.parse(text)), canonical(JSON.parse(JSON.stringify(again)))]
            record.document.roundTrips = wrote === reread
            if (!record.document.roundTrips) record.document.firstDifference = firstDifference(JSON.parse(text), JSON.parse(JSON.stringify(again)))
        })
    }
    return record
}

mkdirSync(out, { recursive: true })
const results = join(out, 'results.jsonl')
if (!only && existsSync(results)) rmSync(results)
const listed = resolve(args.rolls ?? join(here, 'rolls.json'))
// The files of a list are named relative to where the list lies.
const rolls = JSON.parse(readFileSync(listed, 'utf8'))
    .map(roll => ({ ...roll, copies: roll.copies.map(copy => ({ ...copy, file: resolve(dirname(listed), copy.file) })) }))
for (const roll of rolls) {
    if (only && !only.includes(String(roll.number))) continue
    const [record, ms] = timed(() => cycle(roll))
    record.ms.total = ms
    appendFileSync(results, JSON.stringify(record) + '\n')
    console.log(`WM ${String(roll.number).padEnd(5)} ${String(ms).padStart(7)} ms  ${record.proposal?.notation ?? '–'}  ${record.errors.length ? `${record.errors.length} error(s): ${record.errors.map(e => `${e.step}: ${e.message}`).join(' | ').slice(0, 200)}` : 'ok'}`)
}
