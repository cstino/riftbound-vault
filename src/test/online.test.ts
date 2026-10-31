// Partite online: le risposte del PC sono sempre legali per il validatore, una partita rigiocata
// dalle sole risposte arriva allo stesso stato, e le risposte fuori regolamento vengono rifiutate.
import { describe, expect, it } from 'vitest'
import { Match } from '../lib/game'
import { combineSeeds, commitSeed, stateHash, validAnswer } from '../lib/game/online'
import type { Answer } from '../lib/game/types'
import { spec } from './gameHelpers'

const PAIRS = [
  ['Zed', 'Shen'],
  ['Vi', 'Rumble'],
  ['Seraphine', 'Evelynn'],
  ['Fiora', 'Vex'],
] as const

describe('partite online', () => {
  for (const [i, [a, b]] of PAIRS.entries()) {
    it(`${a} contro ${b}: rigiocata dalle risposte, stessa partita`, () => {
      const seed = 1000 + i
      const m = new Match([spec(a), spec(b)], [a, b], null, seed)
      const answers: Answer[] = []
      const hashes: string[] = []
      let d = m.next()
      for (let n = 0; d && n < 300000; n++) {
        const ans = m.aiAnswer(d)
        expect(validAnswer(d, ans), `risposta del PC rifiutata: ${JSON.stringify(ans)} a ${d.type}`).toBe(true)
        answers.push(ans)
        d = m.next(ans)
        hashes.push(stateHash(m.g))
      }
      expect(m.g.winner).not.toBeNull()
      // l'altro dispositivo: stesso seme, nessun PC, solo le risposte ricevute
      const r = new Match([spec(a), spec(b)], [a, b], 0, seed)
      let e = r.next()
      for (const [n, ans] of answers.entries()) {
        expect(e).not.toBeNull()
        expect(validAnswer(e!, ans)).toBe(true)
        e = r.next(ans)
        expect(stateHash(r.g), `divergenza alla mossa ${n}`).toBe(hashes[n])
      }
      expect(r.g.winner).toBe(m.g.winner)
    })
  }

  it('rifiuta le risposte fuori regolamento', () => {
    const m = new Match([spec('Zed'), spec('Shen')], ['Zed', 'Shen'], null, 7)
    let d = m.next()
    let seen = { act: false, choose: false, assign: false }
    for (let n = 0; d && n < 300000 && !(seen.act && seen.choose && seen.assign); n++) {
      if (d.type === 'act') {
        seen.act = true
        expect(validAnswer(d, 'gioca-tutto-gratis')).toBe(false)
        expect(validAnswer(d, 3 as never)).toBe(false)
      } else if (d.type === 'choose') {
        seen.choose = true
        expect(validAnswer(d, [d.options.length])).toBe(false) // opzione inesistente
        expect(validAnswer(d, [-1])).toBe(false)
        if (d.max >= 2 && d.options.length >= 1) expect(validAnswer(d, [0, 0])).toBe(false) // la stessa due volte
        if (d.max < d.options.length) expect(validAnswer(d, d.options.map((_, i) => i))).toBe(false) // troppe
        if (!d.cancel) expect(validAnswer(d, null)).toBe(false)
      } else {
        seen.assign = true
        const [t] = d.targets
        expect(validAnswer(d, { [t.uid]: d.total + 1 })).toBe(false) // più danni di quelli disponibili
        expect(validAnswer(d, { 999999: d.total })).toBe(false) // unità che non è un bersaglio
        expect(validAnswer(d, { [t.uid]: -1, ...Object.fromEntries(d.targets.slice(1).map((u) => [u.uid, 0])) })).toBe(false)
      }
      d = m.next(m.aiAnswer(d))
    }
    expect(seen).toEqual({ act: true, choose: true, assign: true })
  })

  it('il seme nasce da due contributi e l’impronta non lo rivela', async () => {
    expect(combineSeeds(123, 456)).toBe(combineSeeds(456, 123))
    const c = await commitSeed(123, 'sale')
    expect(c).toMatch(/^[0-9a-f]{64}$/)
    expect(await commitSeed(124, 'sale')).not.toBe(c)
  })
})
