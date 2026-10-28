import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GLOSSARY, glossaryIdForTerm } from '../data/glossary'
import { LEARN } from '../data/learn'
import type { Card, RuleEntry } from '../lib/types'
import { presetToDeck, validateDeck } from '../lib/deck'
import type { CardDb } from '../lib/data'

const cards: Card[] = JSON.parse(readFileSync('public/data/cards.json', 'utf8'))
const rules: RuleEntry[] = JSON.parse(readFileSync('public/data/rules.json', 'utf8')).rules
const presets = JSON.parse(readFileSync('public/data/decks.json', 'utf8'))
const db: CardDb = {
  cards,
  byId: new Map(cards.map((c) => [c.id, c])),
  champions: new Set(cards.filter((c) => c.type === 'Champion Unit').map((c) => c.short_name)),
  tags: new Set(cards.flatMap((c) => c.tags)),
}
const ruleExists = (ref: string) => rules.some((r) => r.n === ref)

describe('contenuti fedeli alle regole', () => {
  it('ogni regola citata nel glossario esiste nel Core Rules', () => {
    const missing = GLOSSARY.flatMap((g) => g.rules.filter((r) => !ruleExists(r)).map((r) => `${g.id}:${r}`))
    expect(missing).toEqual([])
  })
  it('ogni regola citata nella guida esiste nel Core Rules', () => {
    const refs = LEARN.flatMap((ch) => [...ch.rules, ...ch.points.map((p) => p.rule).filter(Boolean)] as string[])
    expect(refs.filter((r) => !ruleExists(r))).toEqual([])
  })
  it('le carte degli esempi esistono', () => {
    const missing = GLOSSARY.flatMap((g) => g.example?.cards.filter((id) => !db.byId.has(id)) ?? [])
    expect(missing).toEqual([])
  })
  it('le carte d’esempio contengono davvero la parola chiave spiegata', () => {
    const wrong = GLOSSARY.filter((g) => g.kind !== 'concept' && g.example).filter((g) => {
      const text = g.example!.cards.map((id) => db.byId.get(id)?.text ?? '').join(' ')
      const bracketed = [...text.matchAll(/\[([^\]]+)\]/g)].some((m) => glossaryIdForTerm(m[1]) === g.id)
      // le azioni a volte sono scritte senza parentesi (es. "channel 1 rune")
      const plainWord = g.kind === 'action' && new RegExp(`\\b${g.term}\\b`, 'i').test(text)
      return !bracketed && !plainWord
    })
    expect(wrong.map((g) => g.id)).toEqual([])
  })
  it('ogni parola chiave tra parentesi quadre sulle carte ha una spiegazione', () => {
    const unknown = new Set<string>()
    for (const c of cards) {
      for (const m of (c.text ?? '').matchAll(/\[([^\]]+)\]/g)) {
        const t = m[1].trim()
        if (t === '&gt;' || t === '&gt;&gt;' || /^(NO TEXT|ADD)$/.test(t)) continue
        if (!glossaryIdForTerm(t)) unknown.add(t)
      }
    }
    expect([...unknown]).toEqual([])
  })
})

describe('costruzione del mazzo (regola 103)', () => {
  for (const p of presets) {
    it(`il mazzo ${p.name} è legale`, () => {
      const deck = presetToDeck(p, db)
      expect(validateDeck(deck, db)).toEqual([])
    })
  }
  it('segnala le copie in eccesso', () => {
    const deck = presetToDeck(presets[0], db)
    const [id] = Object.keys(deck.main)
    deck.main[id] = 4
    expect(validateDeck(deck, db).some((i) => i.rule === '103.3.b')).toBe(true)
  })
})
