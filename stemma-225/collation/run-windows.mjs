import { pairWindows } from './blind.mjs'
const w = pairWindows(8)
const rows = [...w].map(([k, v]) => ({ pair: k, n: v.n, offS: v.offsetStart.toFixed(2), sigS: v.sigmaStart.toFixed(2), tolS: v.toleranceStart.toFixed(2), offE: v.offsetEnd.toFixed(2), sigE: v.sigmaEnd.toFixed(2), tolE: v.toleranceEnd.toFixed(2) }))
console.table(rows)
