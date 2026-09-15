import { writeFileSync } from 'node:fs'
import { canonicalNoteIds, edition, Emulation, systemOf, versionsWitnessedBy, view } from './emulator.mjs'

const CURVES = new Set(['hammerRail', 'damper'])

const summarise = version => {
    const emulation = new Emulation(systemOf(version))
    emulation.emulateVersion(version, view)
    const notes = emulation.midiEvents
        .filter(event => event.type === 'noteOn')
        .map(event => ({ id: event.performs.id, canonical: canonicalNoteIds.get(event.performs.id) ?? null, pitch: event.pitch, at: event.at, velocity: event.velocity, mm: event.performs.horizontal.from }))
    const offs = emulation.midiEvents
        .filter(event => event.type === 'noteOff')
        .map(event => ({ id: event.performs.id, pitch: event.pitch, at: event.at }))
    const curves = emulation.curves.map(curve => {
        const step = Math.max(1, Math.round(curve.seconds.length / (curve.seconds.at(-1) * 100)))
        const every = values => values ? Array.from(values).filter((_, index) => index % step === 0) : undefined
        return { name: curve.name, kind: curve.kind, seconds: every(curve.seconds), travel: every(curve.travel), place: every(curve.place) }
    }).filter(curve => CURVES.has(curve.name))
    return { siglum: version.siglum, system: systemOf(version).name, notes, offs, curves, curveNames: emulation.curves.map(curve => curve.name) }
}

const results = edition.versions.map(summarise)
results.forEach(result => console.log(result.siglum, result.system, 'notes', result.notes.length,
    'uncanonical', result.notes.filter(note => !note.canonical).length, 'last', result.notes.at(-1)?.at?.toFixed(1), 'curves', result.curveNames.join(',')))

const witnesses = edition.copies.map(copy => ({
    copy: copy.id,
    keeper: copy.keeper?.name,
    readFrom: copy.readFrom?.kind,
    witnesses: versionsWitnessedBy(view, copy.id).map(w => w.version?.siglum ?? w.siglum ?? JSON.stringify(Object.keys(w))),
}))
witnesses.forEach(w => console.log(w.keeper, w.readFrom, '→', w.witnesses.join(', ')))
writeFileSync('versions.json', JSON.stringify({ versions: results, witnesses }))
