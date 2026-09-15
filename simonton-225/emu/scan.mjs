import { writeFileSync } from 'node:fs'
import { canonicalNoteIds, layers, negotiated, perform, snap, symbolsById } from './emulator.mjs'

const AFFECTED = 0.3
const BASE = process.env.BASE ?? 'C'
const base = snap[BASE]
const velocitiesOf = performance => new Map([...performance].map(([id, e]) => [canonicalNoteIds.get(id) ?? id, e.velocity]))
const baseVelocity = velocitiesOf(perform(base))
const inBase = id => base.has(id)
const notInBase = id => !base.has(id)

/** Readings a layer brings against the base: those the base holds are toggled off, those it lacks are toggled on. */
const families = {
    Cadd: [...layers.Cadd.add],
    Cdel: [...layers.Cdel.remove],
    B2add: [...layers.B2.add],
    B2del: [...layers.B2.remove],
    Badd: [...layers.B.add],
    Bdel: [...layers.B.remove],
    A1add: [...layers.A1.add],
    A1del: [...layers.A1.remove],
}
const relevant = Object.fromEntries(Object.entries(families)
    .map(([family, ids]) => [family, ids.filter(id => symbolsById.get(id).type === 'expression')]))

const controlOf = type => type.replace(/(On|Off)$/, '')

/** On/off perforations of one control and scope, paired in order of place; unpaired ones stand alone. */
const unitsOf = ids => {
    const events = ids.map(id => ({ id, event: negotiated(id) })).filter(({ event }) => event)
        .sort((a, b) => a.event.horizontal.from - b.event.horizontal.from)
    const open = new Map()
    const units = []
    events.forEach(({ id, event }) => {
        const key = `${controlOf(event.expressionType)}|${event.scope}`
        if (event.expressionType.endsWith('On')) {
            if (open.has(key)) units.push(open.get(key))
            open.set(key, [{ id, event }])
        } else if (event.expressionType.endsWith('Off') && open.has(key)) {
            units.push([...open.get(key), { id, event }])
            open.delete(key)
        } else {
            units.push([{ id, event }])
        }
    })
    return [...units, ...open.values()]
}

const toggled = ids => {
    const text = new Set(base)
    ids.forEach(id => (text.has(id) ? text.delete(id) : text.add(id)))
    return text
}
const affectedBy = velocity => [...baseVelocity].filter(([id, v]) => Math.abs((velocity.get(id) ?? v) - v) > AFFECTED).map(([id]) => id)

const clusters = []
for (const [family, ids] of Object.entries(relevant)) {
    const units = unitsOf(ids).map(members => ({ members, affected: new Set(affectedBy(velocitiesOf(perform(toggled(members.map(m => m.id)))))) }))
    const parent = units.map((_, k) => k)
    const find = k => (parent[k] === k ? k : (parent[k] = find(parent[k])))
    units.forEach((a, i) => units.slice(i + 1).forEach((b, d) => {
        if ([...a.affected].some(id => b.affected.has(id))) parent[find(i)] = find(i + 1 + d)
    }))
    const groups = Map.groupBy(units.map((unit, k) => [find(k), unit]), ([root]) => root)
    for (const group of groups.values()) {
        const members = group.flatMap(([, unit]) => unit.members)
        const velocity = velocitiesOf(perform(toggled(members.map(m => m.id))))
        clusters.push({
            family,
            symbols: members.map(({ id, event }) => ({ id, type: event.expressionType, scope: event.scope, from: +event.horizontal.from.toFixed(1), inBase: base.has(id) })),
            from: Math.min(...members.map(m => m.event.horizontal.from)),
            affected: affectedBy(velocity),
            velocity: [...velocity].map(([id, v]) => [id, +v.toFixed(3)]),
        })
    }
    console.log(family, 'readings', ids.length, 'units', units.length, 'clusters', groups.size)
}
writeFileSync(`scan_${BASE}.json`, JSON.stringify({ base: [...baseVelocity].map(([id, v]) => [id, +v.toFixed(3)]), clusters }))
console.log('clusters', clusters.length, 'with audible effect', clusters.filter(c => c.affected.length).length)
