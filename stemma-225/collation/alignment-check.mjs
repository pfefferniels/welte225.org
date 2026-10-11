// Is the alignment onto St1's axis itself automatic? Re-run the library's alignFeatures and compare with what is stored.
import { LR, ed, COPIES, copyBySig } from './base.mjs'
const out = []
for (const s of COPIES.filter(s => s !== 'St1')) {
  const c = copyBySig[s]
  const stored = c.alignment ?? c.measurements?.alignment
  const found = LR.alignmentFor(ed, c, new Date('2026-09-28'))
  // how far apart do the two alignments put a place, over the length of the roll (own places 0..12000 mm)
  const own = LR.ownFeaturesOf ? null : null
  const toAxis = (al, x) => (x + al.shift.horizontal) * al.scale
  let maxDiff = 0
  for (let x = 0; x <= 13000; x += 100) maxDiff = Math.max(maxDiff, Math.abs(toAxis(stored, x) - toAxis(found, x)))
  out.push({ copy: s, storedShift: stored.shift.horizontal.toFixed(3), foundShift: found.shift.horizontal.toFixed(3),
    storedScale: stored.scale.toFixed(7), foundScale: found.scale.toFixed(7), matched: `${stored.matched}/${found.matched}`,
    residual: found.residual.toFixed(3), maxDiffMm: maxDiff.toFixed(4) })
}
console.table(out)
