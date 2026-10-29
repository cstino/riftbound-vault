// Builder automatico: mazzi legali solo con le carte possedute, citando da dove arrivano.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { autoBuild } from '../lib/autobuild'
import { countOf, validateDeck, type MetaData } from '../lib/deck'
import type { Deck } from '../lib/types'
import { db, officialDeck } from './gameHelpers'

const meta: MetaData = JSON.parse(readFileSync('public/data/meta.json', 'utf8'))
/** Un mazzo ufficiale posseduto, con le sue carte chiuse nella scatola. */
function boxed(name: string): { deck: Deck; owned: Record<string, number> } {
  const d = officialDeck(name)
  const added: Record<string, number> = {}
  const put = (id: string | null, q: number) => id && (added[id] = (added[id] ?? 0) + q)
  put(d.legendId, 1)
  for (const [id, q] of Object.entries(d.main)) put(id, q)
  for (const [id, q] of Object.entries(d.runes)) put(id, q)
  for (const id of d.battlefields) put(id, 1)
  return { deck: { ...d, id: `preset-${name.toLowerCase()}`, addedToCollection: added }, owned: { ...added } }
}

describe('builder automatico', () => {
  it('con le carte di un mazzo posseduto costruisce un mazzo legale e cita la scatola', () => {
    const { deck, owned } = boxed('Vi')
    const legend = db.byId.get(deck.legendId!)!
    const champ = db.byId.get(deck.championId!)!
    const r = autoBuild(legend, champ, db, owned, [deck], meta, true)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(countOf(r.deck.main)).toBe(40)
    expect(validateDeck(r.deck, db)).toEqual([])
    for (const l of r.main) expect(l.origins.reduce((a, o) => a + o.q, 0)).toBe(l.qty)
    expect(r.main.every((l) => l.origins.every((o) => o.from === 'Vi'))).toBe(true)
    expect(r.overall).not.toBeNull()
  })

  it('senza le carte chiuse nei mazzi non è fattibile e spiega cosa manca', () => {
    const { deck, owned } = boxed('Vi')
    const r = autoBuild(db.byId.get(deck.legendId!)!, db.byId.get(deck.championId!)!, db, owned, [deck], meta, false)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems.join(' ')).toMatch(/Non hai la Legend/)
    expect(r.problems.join(' ')).toMatch(/ne servono 40/)
  })

  it('le carte sfuse vengono usate prima di quelle in scatola', () => {
    const { deck, owned } = boxed('Vi')
    const id = Object.keys(deck.main).find((x) => x !== deck.championId)!
    owned[id] += 1 // una copia sfusa
    const r = autoBuild(db.byId.get(deck.legendId!)!, db.byId.get(deck.championId!)!, db, owned, [deck], meta, true)
    if (!r.ok) throw new Error(r.problems.join())
    const line = r.main.find((l) => l.card.name === db.byId.get(id)!.name)
    if (line) expect(line.origins[0].from).toBeNull()
  })
})
