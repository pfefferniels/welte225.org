// The track shift of every SUPRA analysis as Stanford's own raw MIDI
// gives it, beside the one the reader settles on. A raw MIDI file holds
// one note per hole, keyed by the position on the bar (key = position +
// 13 on a red roll, see https://supra.stanford.edu/midi-spec/), so the
// shift that carries the analysis's columns onto those keys is the one
// Stanford's software used, found independently of the reader.
//
//   node truth.mjs [--supra ../../pianoroll/SUPRA] [--analyses ../../pianoroll/piano-roll-analyses] [--linked-rolls ../../linked-rolls] > truth.tsv
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) =>
    arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []))
const libraryAt = resolve(args['linked-rolls'] ?? join(here, '../../linked-rolls'))
const analyses = resolve(args.analyses ?? join(here, '../../pianoroll/piano-roll-analyses'), 'analysis')
const raw = resolve(args.supra ?? join(here, '../../pianoroll/SUPRA'), 'welte-red/midi-raw')
const lib = await import(pathToFileURL(join(libraryAt, 'lib/index.js')).href)
const { read } = createRequire(join(libraryAt, 'package.json'))('midifile-ts')

const KEY_OF_POSITION = 13

/** How many notes the raw MIDI holds on every key. */
const keysOf = path => {
    const counts = new Map()
    for (const track of read(readFileSync(path)).tracks) {
        for (const event of track) {
            if (event.subtype === 'noteOn' && event.velocity > 0) counts.set(event.noteNumber, (counts.get(event.noteNumber) ?? 0) + 1)
        }
    }
    return counts
}

/** The shift under which the columns' counts agree best with the keys', and how much of the holes it accounts for. */
const shiftBetween = (columns, keys) => {
    const total = [...columns.values()].reduce((sum, n) => sum + n, 0)
    let best = { shift: NaN, agreed: -1 }
    for (let shift = -40; shift <= 100; shift++) {
        let agreed = 0
        for (const [column, n] of columns) agreed += Math.min(n, keys.get(column + shift + KEY_OF_POSITION) ?? 0)
        if (agreed > best.agreed) best = { shift, agreed }
    }
    return { shift: best.shift, share: total > 0 ? best.agreed / total : 0 }
}

console.log(['druid', 'reader', 'stanford', 'share', 'chains', 'error'].join('\t'))
for (const letter of readdirSync(analyses).sort()) {
    for (const file of readdirSync(join(analyses, letter)).sort()) {
        if (!file.endsWith('_analysis.txt.bz2')) continue
        const druid = file.split('_')[0]
        const midi = join(raw, `${druid}_raw.mid`)
        const text = execFileSync('bzip2', ['-dc', join(analyses, letter, file)], { maxBuffer: 1 << 30 }).toString('utf8')
        const columns = new Map()
        const section = text.slice(text.indexOf('@@BEGIN: HOLES'), text.indexOf('@@END: HOLES'))
        for (const match of section.matchAll(/^@TRACKER_HOLE:\s*(-?\d+)/gm)) columns.set(+match[1], (columns.get(+match[1]) ?? 0) + 1)
        const truth = existsSync(midi) ? shiftBetween(columns, keysOf(midi)) : undefined
        let reader = '', chains = '', error = ''
        try {
            const copy = lib.readFromStanfordAton(text)
            reader = copy.measurements.trackCalibration.shift
            chains = lib.featuresOf(copy).length
        } catch (thrown) {
            error = thrown.message
        }
        console.log([druid, reader, truth?.shift ?? '', truth ? truth.share.toFixed(3) : '', chains, error].join('\t'))
    }
}
