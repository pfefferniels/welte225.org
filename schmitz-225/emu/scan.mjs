import { writeFileSync } from 'node:fs'
import { layers, negotiated, perform, snap, symbolsById } from './emulator.mjs'

const AFFECTED = 0.3
const base = snap.C
const baseVelocity = perform(base)

/** Readings a layer brings against C: those C holds are toggled off, those it lacks are toggled on. */
const families = {
    Cadd: [...layers.Cadd.add],
    Cdel: [...layers.Cdel.remove],
    B: [...layers.B.add].filter(id => base.has(id)),
    B1: [...layers.B1.add],
    A1add: [...layers.A1.add],
    A1remove: [...layers.A1.remove].filter(id => base.has(id)),
}

const isExpression = id => symbolsById.get(id).type === 'expression'
const controlOf = type => type.replace(/(On|Off)$/, '')

/** On/off perforations of one control and scope, paired in order of place; unpaired ones stand alone. */
const unitsOf = ids => {
    const events = ids.filter(isExpression).map(id => ({ id, event: negotiated(id) })).filter(({ event }) => event)
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
for (const [family, ids] of Object.entries(families)) {
    const units = unitsOf(ids).map(members => ({ members, affected: new Set(affectedBy(perform(toggled(members.map(m => m.id))))) }))
    const parent = units.map((_, k) => k)
    const find = k => (parent[k] === k ? k : (parent[k] = find(parent[k])))
    units.forEach((a, i) => units.slice(i + 1).forEach((b, d) => {
        if ([...a.affected].some(id => b.affected.has(id))) parent[find(i)] = find(i + 1 + d)
    }))
    const groups = Map.groupBy(units.map((unit, k) => [find(k), unit]), ([root]) => root)
    for (const group of groups.values()) {
        const members = group.flatMap(([, unit]) => unit.members)
        const velocity = perform(toggled(members.map(m => m.id)))
        clusters.push({
            family,
            symbols: members.map(({ id, event }) => ({ id, type: event.expressionType, scope: event.scope, from: +event.horizontal.from.toFixed(1) })),
            from: Math.min(...members.map(m => m.event.horizontal.from)),
            affected: affectedBy(velocity),
            velocity: [...velocity].map(([id, v]) => [id, +v.toFixed(3)]),
        })
    }
    console.log(family, 'readings', ids.length, 'units', units.length, 'clusters', groups.size)
}
writeFileSync('scan.json', JSON.stringify({ base: [...baseVelocity].map(([id, v]) => [id, +v.toFixed(3)]), clusters }))
console.log('clusters', clusters.length)
