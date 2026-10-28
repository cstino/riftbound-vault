// Carte del mazzo Evelynn: ogni test verifica il testo stampato della carta.
import { describe, expect, it } from 'vitest'
import { available, exhaustUnits, kill, kw, might, scoreBf, takeTurn, settle, units } from '../lib/game/engine'
import type { Decision, Game } from '../lib/game/types'
import { act, add, drive, logText, pick, runes, scene, top, yes } from './gameScene'
import { byName } from './gameHelpers'

function card(name: string, fn: () => void) {
  it(name, fn)
}

const names = (g: Game, list: number[]) => list.map((u) => g.objs.get(u)!.card.name)
const named = (g: Game, name: string) => units(g).filter((u) => u.card.name === name)
const golds = (g: Game) => [...g.objs.values()].filter((o) => o.zone === 'board' && o.card.name === 'Gold')
const legendIs = (g: Game, p: 0 | 1, name: string) => (g.objs.get(g.players[p].legend)!.card = byName(name))
const run = (g: Game, gen: Generator<Decision, unknown, unknown>, script: Parameters<typeof drive>[1] = []) =>
  drive(
    (function* () {
      yield* gen as never
      yield* settle(g)
    })(),
    script,
  )
const can = (g: Game, p: 0 | 1, label: string) => available(g, p).some((a) => a.label.includes(label))

describe('carte del mazzo Evelynn', () => {
  card('Evelynn - Agony\'s Embrace', () => {
    const g = scene()
    legendIs(g, 0, "Evelynn - Agony's Embrace")
    top(g, 0, 'Charm', 'Charm', 'Charm')
    g.bfs[0].controller = 0
    add(g, 0, 'Mournful Witness', 'board', 'bf0') // tiene il controllo del campo (190.4.c)
    add(g, 0, 'Pakaa Cub', 'facedown', 'bf0')
    act(g, 0, 'Gioca Pakaa Cub da nascosta')
    expect(g.players[0].hand.length).toBe(1)
    // una volta per turno
    add(g, 0, 'Momentary Companion', 'facedown', 'bf0')
    act(g, 0, 'Gioca Momentary Companion da nascosta')
    expect(g.players[0].hand.length).toBe(1)
    // nel turno avversario pesca e poi scarta
    const h = scene()
    legendIs(h, 1, "Evelynn - Agony's Embrace")
    top(h, 1, 'Charm')
    h.bfs[1].controller = 1
    add(h, 1, 'Mournful Witness', 'board', 'bf1')
    add(h, 1, 'Pakaa Cub', 'facedown', 'bf1')
    runes(h, 0, 'Fury', 'Fury', 'Fury')
    add(h, 0, 'Ruthless Strike')
    act(h, 0, 'Ruthless Strike', [pick('Mournful Witness'), pick('Pakaa Cub da nascosta')])
    expect(h.players[1].hand.length).toBe(0)
    expect(names(h, h.players[1].trash)).toContain('Charm')
  })

  card('Evelynn, Consuming', () => {
    const g = scene()
    g.bfs[0].controller = 0
    const e = add(g, 0, 'Evelynn, Consuming', 'board', 'bf0')
    e.exhausted = true
    add(g, 0, 'Pakaa Cub', 'facedown', 'bf0')
    act(g, 0, 'Gioca Pakaa Cub da nascosta')
    expect(e.exhausted).toBe(false)
    expect(might(g, e)).toBe(6)
    expect(kw(g, e).temporary).toBe(false)
  })

  card('Evelynn, In Control', () => {
    const g = scene()
    g.bfs[0].controller = 0
    const e = add(g, 0, 'Evelynn, In Control', 'board', 'bf0')
    expect(kw(g, e).disarm).toBe(1)
    run(g, scoreBf(g, 0, 'bf0', 'hold'))
    expect(g.players[0].points).toBe(1) // senza carta coperta solo il punto del campo
    const h = scene()
    h.bfs[0].controller = 0
    add(h, 0, 'Evelynn, In Control', 'board', 'bf0')
    add(h, 0, 'Pakaa Cub', 'facedown', 'bf0')
    run(h, scoreBf(h, 0, 'bf0', 'hold'))
    expect(h.players[0].points).toBe(2)
  })

  card('Evelynn, Entrancing', () => {
    const g = scene()
    g.bfs[0].controller = 0
    const e = add(g, 0, 'Evelynn, Entrancing', 'facedown', 'bf0')
    expect(kw(g, add(g, 0, 'Evelynn, Entrancing', 'board')).backline).toBe(true)
    const t = add(g, 1, 'Mournful Witness', 'board', 'base1')
    void e
    act(g, 0, 'Gioca Evelynn, Entrancing da nascosta', [pick('Mournful Witness')])
    expect(t.loc).toBe('bf0')
  })

  card('Last Caress', () => {
    const g = scene()
    g.bfs[0].controller = 0
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos', 'Chaos', 'Chaos')
    add(g, 0, 'Last Caress')
    act(g, 0, 'Gioca Last Caress')
    add(g, 0, 'Punching Poro')
    // può andare anche nel campo che non controlla
    act(g, 0, 'Gioca Punching Poro', [pick('Grove')])
    const p = named(g, 'Punching Poro')[0]
    expect(p.loc).toBe('bf1')
    expect(p.buff).toBe(true)
    expect(g.players[0].anyBf).toBe(0)
  })

  card('Bushwhack Trap', () => {
    const g = scene()
    g.bfs[0].controller = 0
    add(g, 0, 'Punching Poro', 'board', 'bf0')
    add(g, 0, 'Pakaa Cub', 'facedown', 'bf0')
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos')
    add(g, 0, 'Momentary Companion')
    expect(can(g, 0, 'Nascondi Momentary')).toBe(false)
    add(g, 0, 'Bushwhack Trap')
    act(g, 0, 'Gioca Bushwhack Trap', [pick('Zaun')])
    act(g, 0, 'Nascondi Momentary Companion', [pick('Zaun')])
    expect(g.bfs[0].facedown.length).toBe(2)
  })

  card('K\'Sante, Courageous', () => {
    const g = scene()
    g.bfs[0].controller = 0
    const k = add(g, 0, "K'Sante, Courageous", 'board', 'bf0')
    expect(kw(g, k).shield).toBe(2)
    const before = g.players[0].runes.length
    run(g, scoreBf(g, 0, 'bf0', 'hold'))
    expect(g.players[0].runes.length).toBe(before + 1)
  })

  card('Gutter Guardian', () => {
    const g = scene()
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos')
    add(g, 0, 'Pakaa Cub')
    add(g, 0, 'Gutter Guardian')
    act(g, 0, 'Gioca Gutter Guardian', [pick('Pakaa Cub')])
    expect(g.players[0].pool.any).toBe(1)
  })

  card('Demon Shade', () => {
    const g = scene()
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos')
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Demon Shade')
    act(g, 0, 'Gioca Demon Shade', [pick('Punching Poro'), pick('Spostala'), pick('Zaun')])
    expect(u.loc).toBe('bf0')
    // nessun campo libero: Ganking
    const h = scene()
    h.bfs[0].controller = 1
    h.bfs[1].controller = 1
    runes(h, 0, 'Chaos', 'Chaos', 'Chaos')
    const v = add(h, 0, 'Punching Poro', 'board')
    add(h, 0, 'Demon Shade')
    act(h, 0, 'Gioca Demon Shade', [pick('Punching Poro'), pick('Ganking')])
    expect(kw(h, v).ganking).toBe(true)
  })

  card('The Good Stuff', () => {
    const g = scene()
    g.bfs[0].controller = 0
    top(g, 0, 'Charm', 'Charm', 'Charm')
    add(g, 0, 'Pakaa Cub')
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos', 'Chaos')
    add(g, 0, 'The Good Stuff')
    act(g, 0, 'Gioca The Good Stuff', [pick('Zaun'), pick('Pakaa Cub')])
    expect(g.players[0].hand.length).toBe(3)
    expect(names(g, g.players[0].trash)).toContain('Pakaa Cub')
    run(g, scoreBf(g, 0, 'bf0', 'hold'))
    expect(names(g, g.players[0].hand)).toContain('The Good Stuff')
  })

  card('Elnuk Herd', () => {
    const g = scene()
    g.bfs[0].controller = 0
    const u = add(g, 0, 'Punching Poro', 'board', 'bf0')
    add(g, 0, 'Elnuk Herd', 'facedown', 'bf0')
    act(g, 0, 'Gioca Elnuk Herd da nascosta', [pick('Punching Poro')])
    expect(might(g, u)).toBe(5)
    expect(named(g, 'Elnuk Herd').length).toBe(0)
    expect(g.objs.get(g.players[0].deck[g.players[0].deck.length - 1])!.card.name).toBe('Elnuk Herd')
  })

  card('Reckless Innovator', () => {
    const g = scene()
    const r = add(g, 0, 'Reckless Innovator', 'board')
    run(g, (function* () { exhaustUnits(g, [r], 0) })(), [pick('Gold')])
    expect(golds(g).length).toBe(1)
    expect(golds(g)[0].exhausted).toBe(true)
    const h = scene()
    top(h, 0, 'Charm')
    runes(h, 0, 'Chaos')
    const s = add(h, 0, 'Reckless Innovator', 'board')
    run(h, (function* () { exhaustUnits(h, [s], 0) })(), [pick('Chaos')])
    expect(h.players[0].hand.length).toBe(1)
    expect(h.players[0].runes.length).toBe(0)
  })

  card('Pitiless Stalker', () => {
    const g = scene()
    add(g, 0, 'Pitiless Stalker', 'board')
    const t = add(g, 1, 'Mournful Witness', 'board', 'bf1')
    act(g, 0, 'Pitiless Stalker: Esaurisci', [pick('Mournful Witness')])
    expect(t.stunned).toBe(true)
  })

  card('Sneaky Zeebles', () => {
    const g = scene()
    add(g, 0, 'Sneaky Zeebles', 'board', 'bf1')
    run(g, scoreBf(g, 0, 'bf1', 'conquer'))
    expect(g.players[0].pool.any).toBe(1)
  })

  card('Siren of the Shallows', () => {
    const g = scene()
    const s = add(g, 0, 'Siren of the Shallows', 'board')
    expect(kw(g, s).disarm).toBe(1)
    expect(kw(g, s).ganking).toBe(true)
  })

  card('Hold \'Em', () => {
    const g = scene()
    g.bfs[0].controller = 0
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos')
    const u = add(g, 0, 'Punching Poro')
    add(g, 0, "Hold 'Em")
    act(g, 0, 'Gioca Punching Poro', [pick('Zaun')]) // costa 2: resta 1 runa
    act(g, 0, "Gioca Hold 'Em", [pick('Punching Poro')]) // 3 - 2 = 1
    expect(might(g, named(g, 'Punching Poro')[0])).toBe(5)
    void u
  })

  card('The Waters\' Wage', () => {
    const g = scene()
    runes(g, 0, 'Chaos')
    add(g, 0, "The Waters' Wage")
    act(g, 0, "Gioca The Waters' Wage")
    expect(golds(g).length).toBe(1)
    expect(golds(g)[0].exhausted).toBe(true)
    const h = scene()
    h.bfs[0].controller = 0
    add(h, 0, 'Mournful Witness', 'board', 'bf0') // tiene il controllo del campo (190.4.c)
    add(h, 0, "The Waters' Wage", 'facedown', 'bf0')
    act(h, 0, "Gioca The Waters' Wage da nascosta")
    expect(golds(h).length).toBe(3)
    expect(golds(h).every((o) => !o.exhausted)).toBe(true)
  })

  card('Momentary Companion', () => {
    const g = scene()
    g.bfs[1].controller = 1
    add(g, 1, 'Mournful Witness', 'board', 'bf1')
    add(g, 1, 'Momentary Companion', 'facedown', 'bf1')
    runes(g, 0, 'Fury', 'Fury', 'Fury')
    add(g, 0, 'Ruthless Strike')
    act(g, 0, 'Ruthless Strike', [pick('Mournful Witness'), pick('Momentary Companion da nascosta')])
    const m = named(g, 'Momentary Companion')[0]
    expect(kw(g, m).temporary).toBe(true)
    // 816.1.b: muore all'inizio della Beginning Phase del suo controllore
    g.turnPlayer = 1
    const d = takeTurn(g)
    let r = d.next()
    for (let i = 0; i < 200 && !r.done && g.phase !== 'main'; i++) r = d.next(r.value.type === 'act' ? 'pass' : r.value.type === 'choose' ? [0] : [])
    expect(g.phase).toBe('main')
    expect(named(g, 'Momentary Companion').length).toBe(0)
  })

  card('Suave Negotiator', () => {
    const g = scene()
    top(g, 0, 'Charm')
    top(g, 1, 'Charm')
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos')
    add(g, 0, 'Suave Negotiator')
    act(g, 0, 'Gioca Suave Negotiator')
    expect(g.players[0].hand.length).toBe(1)
    expect(g.players[1].hand.length).toBe(1)
  })

  card('Pakaa Cub', () => {
    const g = scene()
    g.bfs[0].controller = 0
    add(g, 0, 'Mournful Witness', 'board', 'bf0') // tiene il controllo del campo (190.4.c)
    runes(g, 0, 'Chaos')
    add(g, 0, 'Pakaa Cub')
    act(g, 0, 'Nascondi Pakaa Cub', [pick('Zaun')])
    expect(g.bfs[0].facedown.length).toBe(1)
  })

  card('Wrath of the Freljord', () => {
    const g = scene()
    runes(g, 0, ...Array(9).fill('Body'))
    add(g, 0, 'Wrath of the Freljord')
    act(g, 0, 'Gioca Wrath of the Freljord')
    const w = named(g, 'Wrath of the Freljord')[0]
    expect(w.exhausted).toBe(false)
    expect(kw(g, w).shield).toBe(3)
  })

  card('Black Market Broker', () => {
    const g = scene()
    g.bfs[0].controller = 0
    add(g, 0, 'Mournful Witness', 'board', 'bf0') // tiene il controllo del campo (190.4.c)
    add(g, 0, 'Black Market Broker', 'board')
    add(g, 0, 'Pakaa Cub', 'facedown', 'bf0')
    act(g, 0, 'Gioca Pakaa Cub da nascosta')
    expect(golds(g).length).toBe(1)
    expect(golds(g)[0].exhausted).toBe(true)
  })

  card('Siren\'s Song', () => {
    const g = scene()
    runes(g, 0, 'Chaos', 'Chaos')
    const t = add(g, 1, 'Mournful Witness', 'board', 'bf1')
    const still = add(g, 1, 'Soulspinner', 'board', 'bf1')
    add(g, 0, "Siren's Song")
    expect(can(g, 0, "Siren's Song")).toBe(false) // nessuna unità nemica si è mossa
    t.moves = 1
    act(g, 0, "Gioca Siren's Song", [pick('Mournful Witness'), pick('Shen')])
    expect(t.loc).toBe('base1')
    expect(still.loc).toBe('bf1')
  })

  card('Bandle Scouts\' Academy', () => {
    const g = scene()
    g.bfs[0].card = byName("Bandle Scouts' Academy")
    g.bfs[0].controller = 0
    add(g, 0, 'Mournful Witness', 'board', 'bf0') // tiene il controllo del campo (190.4.c)
    runes(g, 0, 'Chaos')
    add(g, 0, 'Pakaa Cub')
    act(g, 0, 'Nascondi Pakaa Cub', [pick('Bandle')])
    expect(golds(g).length).toBe(1)
  })

  card('Rakelstake', () => {
    const g = scene()
    g.bfs[0].card = byName('Rakelstake')
    g.bfs[0].controller = 0
    top(g, 0, 'Charm', 'Charm')
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos', 'Chaos')
    add(g, 0, 'Punching Poro')
    add(g, 0, 'Siren of the Shallows')
    act(g, 0, 'Gioca Punching Poro', [pick('Rakelstake')])
    act(g, 0, 'Gioca Siren of the Shallows', [pick('Rakelstake')])
    expect(logText(g).match(/Predict 1/g)?.length).toBe(1) // solo la prima volta nel turno
  })

  card('Bandle Tree', () => {
    const g = scene()
    g.bfs[0].card = byName('Bandle Tree')
    g.bfs[0].controller = 0
    add(g, 0, 'Mournful Witness', 'board', 'bf0') // tiene il controllo del campo (190.4.c)
    runes(g, 0, 'Chaos', 'Chaos')
    add(g, 0, 'Pakaa Cub')
    add(g, 0, 'Momentary Companion')
    act(g, 0, 'Nascondi Pakaa Cub', [pick('Bandle')])
    act(g, 0, 'Nascondi Momentary Companion', [pick('Bandle')])
    expect(g.bfs[0].facedown.length).toBe(2)
    // 107.3.d: perso il controllo, le carte coperte vanno nel trash al cleanup
    g.bfs[0].controller = 1
    run(g, kill(g, [], 'test'))
    expect(g.bfs[0].facedown.length).toBe(0)
  })
})
