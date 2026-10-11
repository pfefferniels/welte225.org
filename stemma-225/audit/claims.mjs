// Re-count the carrier-pattern statements in the editor's derivation reasons
import { readFileSync } from 'node:fs'
const M = JSON.parse(readFileSync(new URL('matrix.json', import.meta.url),'utf8'))
const ins = v => M.symbols.filter(r => r.insV === v)
const has = (r, c) => r.carriers.includes(c), hasT = (r, c) => r.carriersT.includes(c)
const R2 = ins('R2'), R4 = ins('R4'), L1 = ins('L1')
console.log('R2 ins', R2.length, 'St1', R2.filter(r => has(r, 'St1')).length, 'St2&Ch1', R2.filter(r => has(r, 'St2') && has(r, 'Ch1')).length, 'Ne1', R2.filter(r => has(r, 'Ne1')).length, 'Wi1', R2.filter(r => has(r, 'Wi1')).length)
console.log('R2 ins not deleted by R4/r3:', R2.filter(r => !r.delV.some(d => ['r3', 'R4'].includes(d))).length, ' Ne1 among R2 ins not deleted by r3:', R2.filter(r => !r.delV.includes('r3') && has(r, 'Ne1')).length, 'of', R2.filter(r => !r.delV.includes('r3')).length, '; not deleted by L1:', R2.filter(r => !r.delV.includes('L1')).length, 'Ne1', R2.filter(r => !r.delV.includes('L1') && has(r, 'Ne1')).length)
console.log('R4 ins', R4.length, 'St2', R4.filter(r => has(r, 'St2')).length, 'Ch1', R4.filter(r => has(r, 'Ch1')).length, 'Bo1 raw', R4.filter(r => has(r, 'Bo1')).length, 'Bo1 via recoding link', R4.filter(r => hasT(r, 'Bo1')).length, 'deleted by G1', R4.filter(r => r.delV.includes('G1')).length, 'Ne1', R4.filter(r => has(r, 'Ne1')).length, 'St1', R4.filter(r => has(r, 'St1')).length)
console.log('L1 ins carried by Ch1', L1.filter(r => has(r, 'Ch1')).length)
console.log('R2 correct-error edits', new Set(M.symbols.filter(r => r.insV === 'R2' && r.insEditType === 'correct-error').map(r => r.insEdit)).size, '; their inserted symbols carried by Ne1', M.symbols.filter(r => r.insV === 'R2' && r.insEditType === 'correct-error' && has(r, 'Ne1')).length)
console.log('L2 ins carried by Bo1', ins('L2').filter(r => has(r, 'Bo1')).length, 'notes', ins('L2').filter(r => r.type === 'note').length)
console.log('G1 recoding edits', new Set(M.symbols.filter(r => r.insV === 'G1' && r.insEditType === 'recoding').map(r => r.insEdit)).size)
