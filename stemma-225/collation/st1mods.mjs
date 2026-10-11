import { LR, copyBySig, edSymbolOfRid, readings } from './base.mjs'
for (const s of ['St1','St2','Ch1','Wi1']) {
  const c = copyBySig[s]
  c.modifications.forEach((m, i) => {
    const fs = LR.featuresMadeBy(m)
    console.log(s, i, m.type, m.purpose, 'features', fs.length, (m.removed ?? []).length ? 'removed ' + m.removed.length : '', fs.slice(0, 10).map(f => `${f.type}@${f.horizontal?.from?.toFixed(1)} v${f.vertical?.from}${f.vertical?.to ? '-' + f.vertical.to : ''} ${readings.filter(r => r.fid === f.id).map(r => r.key + (edSymbolOfRid.has(r.rid) ? '' : '(UNCARRIED)')).join('/')}`).join('; '))
  })
}
