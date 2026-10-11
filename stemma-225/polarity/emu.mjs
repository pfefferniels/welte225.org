import { ed, sig, V, LR, symById } from './common.mjs'
import { welteT100System } from 'linked-rolls/welte-t100'
const bar = welteT100System.trackerBar
const ctxCache = new Map()
/** negotiated events, options and roll properties of a version, as emulate() hands them to the system */
export function contextOf(sg) {
  if (ctxCache.has(sg)) return ctxCache.get(sg)
  let captured
  const spy = { ...welteT100System, perform: (events, options, props) => { captured = { events, options, props }; return { events: [], curves: [] } } }
  LR.emulate(spy, V[sg], ed)
  ctxCache.set(sg, captured)
  return captured
}
export const eventOf = s => LR.negotiatedEventOf(ed, s, bar)
/** performs a list of negotiated events; returns note velocities by symbol id and the pedal curves */
export function perform(events, ctx) {
  const p = welteT100System.perform(events, ctx.options, ctx.props)
  const vel = new Map()
  for (const e of p.events) if (e.type === 'noteOn') vel.set(e.performs.id, { v: e.velocity, at: e.at, pitch: e.pitch, from: e.performs.horizontal.from })
  const curves = Object.fromEntries(p.curves.map(c => [c.name, c]))
  return { vel, curves }
}
const baseCache = new Map()
export function baseline(sg) { if (!baseCache.has(sg)) { const c = contextOf(sg); baseCache.set(sg, perform(c.events, c)) } return baseCache.get(sg) }
/** effect of a change (remove ids / add symbols) to the text of version sg, measured against its emulation */
export function effectOf(sg, { remove = [], add = [] } = {}) {
  const ctx = contextOf(sg)
  const base = baseline(sg)
  const rm = new Set(remove)
  const evs = [...ctx.events.filter(e => !rm.has(e.id)), ...add.map(eventOf).filter(Boolean)]
  const out = perform(evs, ctx)
  let maxDv = 0, n1 = 0, n01 = 0, worst = null
  for (const [id, b] of base.vel) { const o = out.vel.get(id); if (!o) continue; const d = o.v - b.v; if (Math.abs(d) >= 1) n1++; if (Math.abs(d) >= 0.1) n01++; if (Math.abs(d) > Math.abs(maxDv)) { maxDv = d; worst = b } }
  const pedal = {}
  for (const name of ['damper', 'hammerRail']) { const a = base.curves[name].travel, b = out.curves[name].travel; let m = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) m = Math.max(m, Math.abs(a[i] - b[i])); pedal[name] = m }
  return { maxDv, n1, n01, worst, pedal }
}
