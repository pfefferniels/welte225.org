// How stable are the character patterns (which copies carry a reading) when the window changes?
import { writeFileSync } from 'node:fs'
import { readings, edSymbols, COPIES, pattern } from './base.mjs'
import { blindCollation, pairWindows } from './blind.mjs'
import { compare, classOf } from './compare.mjs'
const windows = pairWindows(8)
const variants = [
  ['scatter k*sigma (baseline)', {}],
  ['scatter x0.75', { scale: 0.75 }], ['scatter x1.5', { scale: 1.5 }],
  ['fixed 2 mm', { fixed: 2 }], ['fixed 3.5 mm', { fixed: 3.5 }], ['fixed 5 mm', { fixed: 5 }], ['fixed 8 mm', { fixed: 8 }],
  ['fixed 5 mm uncentred', { fixed: 5, centred: false }],
  ['scatter, onset only', { onsetOnly: true }], ['fixed 8 mm, onset only', { fixed: 8, onsetOnly: true }],
]
const groupOf = c => c.kind === 'note' ? 'note' : c.copies.length === 1 && c.copies[0] === 'Bo1' ? 'green' : 'expr'
const spectrum = clusters => { const t = {}; for (const c of clusters) { if (groupOf(c) === 'green') continue; const k = groupOf(c) + ' ' + c.pattern; t[k] = (t[k] ?? 0) + 1 } return t }
const edSpectrum = (() => { const t = {}; for (const s of edSymbols) { const g = s.kind === 'note' ? 'note' : s.copies.length === 1 && s.copies[0] === 'Bo1' ? 'green' : 'expr'; if (g === 'green') continue; const k = g + ' ' + pattern(s.copies); t[k] = (t[k] ?? 0) + 1 } return t })()
const patternOfReading = clusters => { const m = new Map(); for (const c of clusters) for (const r of c.rids) m.set(r, c.pattern); return m }
const runs = variants.map(([name, o]) => { const { clusters } = blindCollation({ windows, linkage: 'single', ...o }); return { name, clusters, cmp: compare(clusters), spec: spectrum(clusters), pr: patternOfReading(clusters) } })
const base = runs[0]
const l1 = (a, b) => { const ks = new Set([...Object.keys(a), ...Object.keys(b)]); let d = 0; for (const k of ks) d += Math.abs((a[k] ?? 0) - (b[k] ?? 0)); return d }
const nonGreen = readings.filter(r => !(r.copy === 'Bo1' && r.kind === 'expression'))
const variantClusters = s => Object.entries(s).filter(([k]) => !(k === 'note St1+St2+Wi1+Ch1+Bo1+Ne1' || k === 'expr St1+St2+Wi1+Ch1+Ne1')).reduce((n, [, v]) => n + v, 0)
const table = runs.map(r => ({ variant: r.name, clusters: r.clusters.length, exactPct: (100 * r.cmp.exact / r.cmp.n).toFixed(1),
  notesExact: `${r.cmp.tallyKind.note.exact}/${r.cmp.tallyKind.note.n}`, exprExact: `${r.cmp.tallyKind['red/Lic expr'].exact}/${r.cmp.tallyKind['red/Lic expr'].n}`,
  patterns: Object.keys(r.spec).length, variantClusters: variantClusters(r.spec),
  readingsPatternChanged: nonGreen.filter(x => r.pr.get(x.rid) !== base.pr.get(x.rid)).length,
  spectrumL1vsBaseline: l1(r.spec, base.spec), spectrumL1vsEdition: l1(r.spec, edSpectrum) }))
console.table(table)
console.log('edition: patterns', Object.keys(edSpectrum).length, 'variant symbols', variantClusters(edSpectrum))
// the spectrum side by side for the main patterns
const keys = [...new Set([...Object.keys(edSpectrum), ...runs.flatMap(r => Object.keys(r.spec))])]
  .sort((a, b) => (edSpectrum[b] ?? 0) - (edSpectrum[a] ?? 0) || (base.spec[b] ?? 0) - (base.spec[a] ?? 0))
const sel = [0, 3, 4, 5, 6, 8]
console.table(keys.map(k => Object.fromEntries([['pattern', k], ['edition', edSpectrum[k] ?? 0], ...sel.map(i => [runs[i].name.replace('scatter k*sigma (baseline)', 'scatter'), runs[i].spec[k] ?? 0])])).filter(r => Object.values(r).slice(1).some(v => v >= 2)))
writeFileSync(new URL('out/sensitivity.json', import.meta.url), JSON.stringify({ table, edition: edSpectrum, spectra: Object.fromEntries(runs.map(r => [r.name, r.spec])) }, null, 1))
