import { ed, sig, V, LR, textOf, latchRedundancies, fmt, symById, parentOf, carrierCopies, place } from './common.mjs'
const rows = []
for (const v of ed.versions) {
  const sg = sig.get(v.id), par = parentOf(sg)
  if (!par || sg === 'G1') continue
  const tP = textOf(par), tC = textOf(sg)
  const redP = latchRedundancies(tP), redC = latchRedundancies(tC)
  const inC = new Set(tC.map(s => s.id))
  // deletions
  const delTab = {}, insTab = {}
  for (const e of LR.editsOf(v)) {
    const lab = `${e.editType ?? '-'}/${e.motivation && e.motivation.length < 40 ? e.motivation : (e.motivation ? 'uuid' : '-')}`
    for (const id of e.delete ?? []) {
      const s = symById.get(id); if (s.type !== 'expression') continue
      const k = (redP.has(id) ? 'RED ' : 'eff ') + lab
      delTab[k] = (delTab[k] ?? 0) + 1
    }
    for (const s of e.insert ?? []) { if (s.type !== 'expression') continue
      const k = (redC.has(s.id) ? 'RED ' : 'eff ') + lab
      insTab[k] = (insTab[k] ?? 0) + 1 }
  }
  // redundancies resolved (parent-redundant, still present in child, not redundant in child)
  const resolved = [...redP.keys()].filter(id => inC.has(id) && !redC.has(id))
  // new redundancies among inherited symbols
  const created = [...redC.keys()].filter(id => tP.some(s => s.id === id) && !redP.has(id))
  console.log(`\n=== ${sg} <- ${par}: parent redundancies ${redP.size}, child ${redC.size}`)
  console.log('  expr deletions:', JSON.stringify(delTab))
  console.log('  expr insertions:', JSON.stringify(insTab))
  console.log('  parent redundancies made effective in child (explain-redundancy violations):', resolved.map(id => fmt(symById.get(id))).join(' '))
  console.log('  inherited symbols that became redundant:', created.map(id => fmt(symById.get(id)) + '[' + carrierCopies(symById.get(id)) + ']').join(' '))
  console.log('  parent redundancies kept:', [...redP.keys()].filter(id => redC.has(id)).map(id => fmt(symById.get(id))).join(' '))
}
