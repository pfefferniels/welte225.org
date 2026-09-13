import { readFileSync, writeFileSync } from 'node:fs'
const LR = '/Users/nielspfeffer/Projects/linked-rolls/lib'
const { importJsonLd } = await import(`${LR}/importJsonLd.js`)
const { EditionView } = await import(`${LR}/EditionView.js`)
const { Emulation } = await import(`${LR}/Emulation.js`)
const systemModule = await import(`${LR}/systems/welteT100/system.js`)

const system = Object.values(systemModule).find(value => value && typeof value.perform === 'function')
console.log('system', system?.name, Object.keys(systemModule))

const edition = importJsonLd(JSON.parse(readFileSync('/Users/nielspfeffer/Projects/welte225.org/edition.jsonld', 'utf8')))
const view = new EditionView(edition)

const summarise = (version) => {
    const emulation = new Emulation(system)
    emulation.emulateVersion(version, view)
    const notes = emulation.midiEvents
        .filter(event => event.type === 'noteOn')
        .map(event => ({ id: event.performs.id, pitch: event.pitch, at: event.at, velocity: event.velocity, mm: event.performs.horizontal.from }))
    const offs = emulation.midiEvents
        .filter(event => event.type === 'noteOff')
        .map(event => ({ id: event.performs.id, pitch: event.pitch, at: event.at }))
    const pedals = emulation.midiEvents
        .filter(event => event.type !== 'noteOn' && event.type !== 'noteOff')
        .map(event => ({ type: event.type, at: event.at, value: event.value, id: event.performs.id }))
    const expressions = emulation.negotiatedEvents
        .filter(event => event.type === 'expression')
        .map(event => ({ id: event.id, expressionType: event.expressionType, scope: event.scope, from: event.horizontal.from, to: event.horizontal.to }))
    const curves = emulation.curves.map(curve => {
        const step = Math.max(1, Math.round(curve.seconds.length / (curve.seconds.at(-1) * 100)))
        const every = values => values ? Array.from(values).filter((_, index) => index % step === 0) : undefined
        return { name: curve.name, kind: curve.kind, seconds: every(curve.seconds), travel: every(curve.travel), velocity: every(curve.velocity), place: every(curve.place) }
    })
    return { siglum: version.siglum, notes, offs, pedals: pedals.filter((_, index) => index % 10 === 0), expressions, curves }
}

const wanted = ['A', 'A1', 'B', 'B1', 'C']
const results = edition.versions.filter(version => wanted.includes(version.siglum)).map(summarise)
results.forEach(result => {
    console.log(result.siglum, 'notes', result.notes.length, 'expr', result.expressions.length, 'pedal events', result.pedals.length,
        'curves', result.curves.map(curve => Object.keys(curve)).slice(0, 2), 'last', result.notes.at(-1)?.at?.toFixed(1))
})
writeFileSync('versions.json', JSON.stringify(results))
