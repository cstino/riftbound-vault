// Carte aggiunte per i mazzi modificati: ogni test verifica il testo stampato della carta.
import { describe, expect, it } from 'vitest'
import { units } from '../lib/game/engine'
import type { Decision, Game } from '../lib/game/types'
import { act, add, logText, no, pick, runes, scene, yes } from './gameScene'

function card(name: string, fn: () => void) {
  it(name, fn)
}

const named = (g: Game, name: string) => units(g).filter((u) => u.card.name === name)
const passAll = (d: Decision) => (d.type === 'act' ? 'pass' : undefined)
const inHand = (g: Game, p: 0 | 1) => g.players[p].hand.map((u) => g.objs.get(u)!.card.name)

describe('carte aggiunte (Zed modificato)', () => {
  card('Tentacle', () => {
    // 187.10: unità token senza dominio, 1 Might, tag Bilgewater
    const g = scene()
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos')
    add(g, 0, 'Up from the Deep')
    act(g, 0, 'Gioca Up from the Deep', [], passAll)
    const t = named(g, 'Tentacle')[0]
    expect(t.token).toBe(true)
    expect(t.card.might).toBe(1)
    expect(t.card.tags).toEqual(['Bilgewater'])
    expect(t.card.domains).toEqual([])
  })

  card('Up from the Deep', () => {
    const g = scene()
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos')
    add(g, 0, 'Up from the Deep')
    act(g, 0, 'Gioca Up from the Deep', [], passAll)
    // due token Tentacle da 1, nella base (unico posto possibile senza campi controllati, 355.2.a)
    const ts = named(g, 'Tentacle')
    expect(ts.length).toBe(2)
    expect(ts.every((t) => t.loc === 'base0' && t.exhausted)).toBe(true) // le unità entrano esauste (143.4)
    // Flow [3]: dal trash, poi esiliata (829.1.b.1)
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos')
    act(g, 0, 'Gioca Up from the Deep dal trash', [], passAll)
    expect(named(g, 'Tentacle').length).toBe(4)
    expect(g.players[0].banish.map((u) => g.objs.get(u)!.card.name)).toEqual(['Up from the Deep'])
  })

  card('Bedeviling Stranger', () => {
    // con 4 o più unità nel campo scelto: puoi rimandare in mano un'unità nemica lì
    const g = scene()
    for (const n of ['Punching Poro', 'Shadow Fiend']) add(g, 0, n, 'board', 'bf0')
    for (const n of ['Mournful Witness', 'Loyal Poro']) add(g, 1, n, 'board', 'bf0')
    runes(g, 0, 'Chaos', 'Chaos')
    add(g, 0, 'Bedeviling Stranger')
    act(g, 0, 'Gioca Bedeviling Stranger', [pick(g.bfs[0].card.name), yes, pick('Mournful Witness')], passAll)
    expect(inHand(g, 1)).toContain('Mournful Witness')
    expect(logText(g)).toMatch(/Mournful Witness torna nella mano/)

    // "you may": si può rinunciare
    const h = scene()
    for (const n of ['Punching Poro', 'Shadow Fiend']) add(h, 0, n, 'board', 'bf0')
    for (const n of ['Mournful Witness', 'Loyal Poro']) add(h, 1, n, 'board', 'bf0')
    runes(h, 0, 'Chaos', 'Chaos')
    add(h, 0, 'Bedeviling Stranger')
    act(h, 0, 'Gioca Bedeviling Stranger', [pick(h.bfs[0].card.name), no], passAll)
    expect(inHand(h, 1)).not.toContain('Mournful Witness')

    // meno di 4 unità: nessun effetto (nemmeno la domanda)
    const k = scene()
    add(k, 0, 'Punching Poro', 'board', 'bf0')
    add(k, 1, 'Mournful Witness', 'board', 'bf0')
    runes(k, 0, 'Chaos', 'Chaos')
    add(k, 0, 'Bedeviling Stranger')
    act(k, 0, 'Gioca Bedeviling Stranger', [pick(k.bfs[0].card.name)], passAll)
    expect(inHand(k, 1)).not.toContain('Mournful Witness')
    expect(logText(k)).not.toMatch(/torna nella mano/)
  })

  card('Bedeviling Stranger nascosta', () => {
    // [Hidden]: giocata dalla Facedown Zone, il campo si sceglie solo tra quello in cui era nascosta (811.1.d.2)
    const g = scene()
    g.bfs[1].controller = 0
    add(g, 0, 'Punching Poro', 'board', 'bf1')
    add(g, 0, 'Bedeviling Stranger', 'facedown', 'bf1')
    let seen: Decision | null = null
    act(g, 0, 'Gioca Bedeviling Stranger da nascosta', [(d) => ((seen = d), 0)], passAll)
    expect(seen!.type === 'choose' && seen!.options.map((o) => o.loc)).toEqual(['bf1'])
    expect(named(g, 'Bedeviling Stranger')[0].loc).toBe('bf1')
  })
})
