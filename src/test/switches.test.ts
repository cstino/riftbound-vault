// Scelta della carta da togliere quando il mazzo è pieno: solo fatti, nessun giudizio sulla forza.
import { describe, expect, it } from 'vitest'
import { META_MIN_GOOD, metaSwitches, replaceOptions, type MetaData } from '../lib/deck'
import { db, officialDeck } from './gameHelpers'

const deck = () => ({ ...officialDeck('Zed'), id: 'test', name: 'Zed' })

describe('carte da togliere', () => {
  it('il campione scelto resta sempre con almeno una copia (103.3.a)', () => {
    const d = deck()
    d.main[d.championId!] = 1
    expect(replaceOptions(d, db).some((o) => o.card.id === d.championId)).toBe(false)
  })

  it('prima le carte che non possiedi, con il conto delle copie', () => {
    const d = deck()
    const [first, ...rest] = Object.keys(d.main).filter((id) => id !== d.championId)
    const owned = Object.fromEntries(rest.map((id) => [id, 3]))
    const o = replaceOptions(d, db, owned)
    expect(o[0].card.id).toBe(first)
    expect(o[0].notes[0]).toMatch(/Ne possiedi 0 su/)
    expect(o.slice(1).every((x) => x.notes.length === 0 || x.card.id === d.championId)).toBe(true)
  })
})

describe('switch dai tornei', () => {
  const base = () => {
    const d = deck()
    const legend = db.byId.get(d.legendId!)!.name
    const ids = Object.keys(d.main).filter((id) => id !== d.championId)
    const outCard = db.byId.get(ids[0])!
    // una carta legale che non è nel mazzo
    const inCard = db.cards.find((c) => c.type === 'Unit' && !Object.keys(d.main).some((id) => db.byId.get(id)!.name === c.name) && c.domains.every((x) => db.byId.get(d.legendId!)!.domains.includes(x)))!
    const cards: Record<string, { share: number; copies: number }> = {}
    for (const id of Object.keys(d.main)) cards[db.byId.get(id)!.name] = { share: 0.9, copies: 2 }
    cards[outCard.name] = { share: 0.1, copies: 1 }
    cards[inCard.name] = { share: 0.8, copies: 2.5 }
    const meta: MetaData = { source: 'TopDeck.gg', sourceUrl: 'https://topdeck.gg', days: 365, generatedAt: 0, goodRule: '', legends: { [legend]: { lists: 40, good: 20, cards } } }
    return { d, meta, legend, outCard, inCard }
  }

  it('propone la carta posseduta molto giocata al posto di quella poco giocata', () => {
    const { d, meta, outCard, inCard } = base()
    const r = metaSwitches(d, db, { [inCard.id]: 1 }, meta)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.switches.map((s) => [s.out.name, s.in.name])).toEqual([[outCard.name, inCard.name]])
    expect(r.switches[0].shareIn).toBe(0.8)
  })

  it('niente se la carta non è posseduta o se le liste sono poche', () => {
    const { d, meta, legend, inCard } = base()
    const r = metaSwitches(d, db, {}, meta)
    expect(r.status === 'ok' && r.switches.length).toBe(0)
    meta.legends[legend].good = META_MIN_GOOD - 1
    expect(metaSwitches(d, db, { [inCard.id]: 1 }, meta).status).toBe('few')
  })

  it('sotto le soglie non propone niente', () => {
    const { d, meta, legend, outCard, inCard } = base()
    meta.legends[legend].cards[inCard.name].share = 0.49
    expect((metaSwitches(d, db, { [inCard.id]: 1 }, meta) as { switches: unknown[] }).switches).toEqual([])
    meta.legends[legend].cards[inCard.name].share = 0.8
    meta.legends[legend].cards[outCard.name].share = 0.21
    expect((metaSwitches(d, db, { [inCard.id]: 1 }, meta) as { switches: unknown[] }).switches).toEqual([])
  })
})
