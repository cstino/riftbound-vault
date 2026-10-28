import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Card, RuleEntry } from '../lib/types'
import { LESSONS, TRAINING_POOL } from '../data/training'
import { autoAssign, resolveCombat, totalDamage, unitFromCard } from '../lib/combat'

const cards: Card[] = JSON.parse(readFileSync('public/data/cards.json', 'utf8'))
const rules: RuleEntry[] = JSON.parse(readFileSync('public/data/rules.json', 'utf8')).rules
const card = (name: string) => cards.find((c) => c.name === name && !c.alt_art)!

describe('lezioni di allenamento', () => {
  it('le carte usate hanno solo parole chiave gestite dal motore', () => {
    for (const name of TRAINING_POOL) {
      const c = card(name)
      expect(c, name).toBeTruthy()
      const rest = (c.text ?? '').replace(/<[^>]+>/g, ' ').replace(/\([^)]*\)/g, '').replace(/\[(Assault|Shield)(\s*\d+)?\]|\[(Tank|Backline)\]/g, '').trim()
      expect(rest, name).toBe('')
    }
  })
  it('le regole citate esistono', () => {
    const missing = LESSONS.flatMap((l) => l.rules.filter((r) => !rules.some((x) => x.n === r)))
    expect(missing).toEqual([])
  })
  for (const l of LESSONS) {
    it(`${l.title}: esito atteso giocando bene`, () => {
      let i = 0
      const mk = (u: { card: string; stunned?: boolean; damage?: number }) => unitFromCard(card(u.card), `x${i++}`, { stunned: u.stunned, damage: u.damage })
      const a = l.attackers.map(mk)
      const d = l.defenders.map(mk)
      const r = resolveCombat(a, d, autoAssign(totalDamage(a, 'attacker'), d, 'defender'), { points: l.points, victory: 8, battlefields: 2, scoredOthers: l.scoredOthers })
      expect(r.outcome.kind).toBe(l.id === 'stallo' ? 'no-result' : 'conquer')
    })
  }
})
