import { readFileSync, existsSync } from 'node:fs'
for (const sg of ['r1','R1.1','R2','r3','R4','L1','L2']) {
  const f = new URL(`eff_${sg}.json`, import.meta.url); if (!existsSync(f)) continue
  const rows = JSON.parse(readFileSync(f))
  const eff = r => Math.abs(r.maxDv) >= 1 || r.damper > 0.05 || r.hammerRail > 0.05
  const eff01 = r => Math.abs(r.maxDv) >= 0.1 || r.damper > 0.01 || r.hammerRail > 0.01
  const t = {}
  for (const r of rows) { const fam = r.sym.replace(/@.*/, '').replace(/\.(b|t)$/, ''); const k = `${r.latchRed ? 'latchRED' : 'latchEff'} ${eff(r) ? 'emuEff' : (eff01(r) ? 'emuWeak' : 'emuNone')}`; t[k] = (t[k] ?? 0) + 1 }
  console.log(sg, rows.length, JSON.stringify(t))
  const byFam = {}
  for (const r of rows.filter(r => !eff(r))) { const fam = r.sym.replace(/@.*/, ''); byFam[fam + (r.latchRed ? '(R)' : '')] = (byFam[fam + (r.latchRed ? '(R)' : '')] ?? 0) + 1 }
  console.log('   emu-ineffective (<1 vel step, pedal<0.05) by type:', JSON.stringify(byFam))
  console.log('   latch-redundant but emu-effective:', rows.filter(r => r.latchRed && eff(r)).map(r => `${r.sym} dv=${r.maxDv.toFixed(1)} n=${r.n1}`).join('; '))
}
