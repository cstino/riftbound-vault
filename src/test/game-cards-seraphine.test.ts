// Carte del mazzo Seraphine (Radiance): ogni test verifica il testo stampato della carta.
import { describe, expect, it } from 'vitest'
import { exhaustUnits, kill, kw, might, playToken, scoreBf, settle, spawn, units } from '../lib/game/engine'
import { RECRUIT } from '../lib/game/cards'
import type { Decision, Game } from '../lib/game/types'
import { act, add, drive, logText, pick, runes, scene, top, yes } from './gameScene'
import { byName } from './gameHelpers'

function card(name: string, fn: () => void) {
  it(name, fn)
}

const names = (g: Game, list: number[]) => list.map((u) => g.objs.get(u)!.card.name)
const named = (g: Game, name: string) => units(g).filter((u) => u.card.name === name)
const passAll = (d: Decision) => (d.type === 'act' ? 'pass' : undefined)
const legendIs = (g: Game, p: 0 | 1, name: string) => (g.objs.get(g.players[p].legend)!.card = byName(name))
const run = (g: Game, gen: Generator<Decision, unknown, unknown>, script: Parameters<typeof drive>[1] = []) =>
  drive(
    (function* () {
      yield* gen as never
      yield* settle(g)
    })(),
    script,
  )
const O = (n: number) => Array(n).fill('Order') as 'Order'[]
const M = (n: number) => Array(n).fill('Mind') as 'Mind'[]

describe('carte del mazzo Seraphine (Radiance)', () => {
  card('Seraphine - Starry-Eyed Songstress', () => {
    const g = scene()
    legendIs(g, 0, 'Seraphine - Starry-Eyed Songstress')
    const us = [add(g, 0, 'Punching Poro', 'board'), add(g, 0, 'Shadow Fiend', 'board'), add(g, 0, 'Shadow Assassin', 'board')]
    runes(g, 0, ...M(1))
    add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    add(g, 0, 'High Note') // costa 3: con lo sconto di 2 costa 1
    // 355-356: prima il bersaglio, poi si pagano i costi
    act(g, 0, 'Gioca High Note', [yes, pick('Pakaa Protector'), pick('Punching Poro', 'Shadow Fiend', 'Shadow Assassin')])
    expect(us.every((u) => u.exhausted)).toBe(true)
    expect(g.objs.get(g.players[0].legend)!.exhausted).toBe(true)
    expect(might(g, units(g).find((u) => u.card.name === 'Pakaa Protector')!)).toBe(1) // -3: tre unità esauste
  })

  card('Seraphine, Inspiring', () => {
    const g = scene()
    const s = add(g, 0, 'Seraphine, Inspiring', 'board')
    expect(kw(g, s).disarm).toBe(2)
    const us = [add(g, 0, 'Punching Poro', 'board'), add(g, 0, 'Shadow Fiend', 'board'), add(g, 0, 'Shadow Assassin', 'board')]
    run(g, (function* () { exhaustUnits(g, us, 0) })(), [yes])
    expect(g.players[0].hand.length).toBe(1)
    // una volta per turno
    for (const u of us) u.exhausted = false
    run(g, (function* () { exhaustUnits(g, us, 0) })())
    expect(g.players[0].hand.length).toBe(1)
  })

  card('Seraphine, Not Alone', () => {
    const g = scene()
    runes(g, 0, ...O(6))
    add(g, 0, 'Seraphine, Not Alone')
    act(g, 0, 'Gioca Seraphine, Not Alone')
    expect(named(g, 'Recruit').length).toBe(1)
    const s = named(g, 'Seraphine, Not Alone')[0]
    s.exhausted = false
    named(g, 'Recruit')[0].exhausted = false
    expect(might(g, s)).toBe(1)
    run(g, (function* () { exhaustUnits(g, [s], 0) })())
    expect(named(g, 'Recruit').length).toBe(2) // anche quando diventa esausta
    named(g, 'Recruit')[0].exhausted = true
    expect(might(g, s)).toBe(3) // +1 per ogni altra unità esausta (due Recruit)
  })

  card('Encore', () => {
    const g = scene()
    runes(g, 0, ...O(4))
    const t = add(g, 1, 'Mournful Witness', 'board', 'bf1')
    add(g, 0, 'Encore')
    act(g, 0, 'Gioca Encore', [pick('Infliggi 2', 'Gioca due token Recruit'), pick('Mournful Witness')])
    expect(g.objs.has(t.uid)).toBe(false)
    expect(named(g, 'Recruit').length).toBe(2)
    const h = scene()
    runes(h, 0, ...O(4))
    top(h, 0, 'Charm', 'Death Mark')
    const u = add(h, 0, 'Punching Poro', 'board')
    add(h, 0, 'Encore')
    act(h, 0, 'Gioca Encore', [pick('Fino a due', 'Guarda le prime 2'), pick('Punching Poro'), (d) => (d.type === 'choose' && d.title.includes('seconda') ? null : pick('Charm')(d)), pick('Charm')])
    expect(might(h, u)).toBe(3)
    expect(names(h, h.players[0].hand)).toEqual(['Charm'])
  })

  card('Heimerdinger, Academy Instructor', () => {
    const g = scene()
    add(g, 0, 'Heimerdinger, Academy Instructor', 'board', 'bf0')
    run(g, playToken(g, 0, RECRUIT, 'base0'), [yes])
    expect(named(g, 'Mech').length).toBe(1)
    expect(named(g, 'Recruit').length).toBe(0)
  })

  card('Raucous Anthem', () => {
    const g = scene()
    runes(g, 0, ...O(8))
    const a = add(g, 0, 'Punching Poro', 'board')
    a.exhausted = true
    add(g, 0, 'Raucous Anthem')
    act(g, 0, 'Gioca Raucous Anthem')
    expect(a.exhausted).toBe(false)
    expect(might(g, a)).toBe(5)
  })

  card('Piltovan Guidebot', () => {
    const g = scene()
    const b = add(g, 0, 'Piltovan Guidebot', 'board')
    runes(g, 0, ...O(6))
    add(g, 0, 'Shadow Assassin')
    act(g, 0, 'Gioca Shadow Assassin', [yes])
    expect(might(g, b)).toBe(5)
  })

  card('Dune Devourer', () => {
    const g = scene()
    const victim = add(g, 0, 'Punching Poro', 'board')
    runes(g, 0, ...O(6)) // 7 - 2 = 5 energia e 1 Power
    add(g, 0, 'Dune Devourer')
    act(g, 0, 'Gioca Dune Devourer', [yes, pick('Punching Poro')])
    expect(g.objs.has(victim.uid)).toBe(false)
    expect(kw(g, named(g, 'Dune Devourer')[0]).deflect).toBe(1)
  })

  card('The Empyrean', () => {
    const g = scene()
    runes(g, 0, ...M(8))
    top(g, 0, 'Charm', 'Charm', 'Charm')
    add(g, 0, 'Morgana, Vindictive') // Power 1
    add(g, 0, 'The Empyrean')
    act(g, 0, 'Gioca The Empyrean', [pick('Morgana')])
    expect(logText(g)).toMatch(/Show Off/)
    expect(logText(g)).toMatch(/Predict 1/)
    expect(g.players[0].hand.length).toBe(3) // Morgana resta in mano, più due pescate
  })

  card('Steadfast Outrider', () => {
    const g = scene()
    const s = add(g, 0, 'Steadfast Outrider', 'board', 'bf0')
    expect(kw(g, s).tank).toBe(true)
    add(g, 0, 'Punching Poro', 'board', 'bf0')
    expect(might(g, s)).toBe(3)
    add(g, 0, 'Shadow Fiend', 'board', 'bf0')
    expect(might(g, s)).toBe(5)
  })

  card('Rousing Display', () => {
    const g = scene()
    runes(g, 0, ...O(5))
    add(g, 0, 'Rousing Display')
    act(g, 0, 'Gioca Rousing Display')
    expect(named(g, 'Recruit').length).toBe(2)
    const h = scene()
    runes(h, 0, ...O(5))
    add(h, 0, 'Wrath of the Freljord') // costo 9
    add(h, 0, 'Rousing Display')
    act(h, 0, 'Gioca Rousing Display', [pick('Wrath')])
    expect(named(h, 'Recruit').length).toBe(4)
  })

  card('Supernova', () => {
    const g = scene()
    runes(g, 0, ...M(10))
    const t = add(g, 1, 'Shen, Leader of the Kinkou Order', 'board', 'bf1')
    add(g, 0, 'Supernova')
    act(g, 0, 'Gioca Supernova', [pick('Shen')])
    expect(g.objs.has(t.uid)).toBe(false)
    expect(g.players[0].hand.length).toBe(2)
  })

  card('Burn Away', () => {
    const g = scene()
    runes(g, 0, ...O(4))
    const gear = add(g, 1, 'Hand Hammer', 'board', 'base1')
    add(g, 0, 'Burn Away')
    act(g, 0, 'Gioca Burn Away', [pick('Hand Hammer')])
    expect(names(g, g.players[1].banish)).toEqual(['Hand Hammer'])
    expect(g.objs.has(gear.uid)).toBe(false)
    expect(g.players[0].trash.length).toBe(3) // Burn 2 più la magia
  })

  card('Concert Poster', () => {
    const g = scene()
    runes(g, 0, ...O(2))
    add(g, 0, 'Concert Poster')
    act(g, 0, 'Gioca Concert Poster', [pick('Grove'), yes])
    const poster = [...g.objs.values()].find((o) => o.zone === 'board' && o.card.name === 'Concert Poster')!
    expect(poster.loc).toBe('bf1') // Deploy: anche in un campo non tuo, e non viene richiamato
    expect(named(g, 'Recruit').length).toBe(1)
    // l'avversario tiene il campo: muore
    g.bfs[1].controller = 1
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    run(g, scoreBf(g, 1, 'bf1', 'hold'))
    expect(g.objs.has(poster.uid)).toBe(false)
  })

  card('Strigian Oracle', () => {
    const g = scene()
    const o = add(g, 0, 'Strigian Oracle', 'board')
    act(g, 0, 'Muovi', [pick('Strigian Oracle'), pick('Grove')], passAll)
    expect(o.exhausted).toBe(true)
    expect(logText(g)).toMatch(/Predict 1/)
  })

  card('High Note', () => {
    const g = scene()
    runes(g, 0, ...M(3))
    add(g, 0, 'Punching Poro', 'board').exhausted = true
    add(g, 0, 'Shadow Fiend', 'board').exhausted = true
    const t = add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    add(g, 0, 'High Note')
    act(g, 0, 'Gioca High Note', [pick('Pakaa Protector')])
    expect(might(g, t)).toBe(2)
  })

  card('Fanfare', () => {
    const g = scene()
    runes(g, 0, ...M(12))
    add(g, 0, 'Fanfare')
    act(g, 0, 'Gioca Fanfare')
    add(g, 0, 'Punching Poro')
    act(g, 0, 'Gioca Punching Poro')
    expect(g.players[0].hand.length).toBe(1)
  })

  card('Hunting Dog', () => {
    const g = scene()
    const d = add(g, 0, 'Hunting Dog', 'board', 'bf1')
    run(g, kill(g, [d], 'test'))
    expect(named(g, 'Bird').length).toBe(1)
  })

  card('Industrious Mechsmith', () => {
    const g = scene()
    runes(g, 0, ...M(4))
    add(g, 0, 'Industrious Mechsmith')
    act(g, 0, 'Gioca Industrious Mechsmith')
    expect(named(g, 'Mech')[0].loc).toBe('base0')
  })

  card('Faithful Manufactor', () => {
    const g = scene()
    g.bfs[0].controller = 0
    add(g, 0, 'Punching Poro', 'board', 'bf0')
    runes(g, 0, ...O(3))
    add(g, 0, 'Faithful Manufactor')
    act(g, 0, 'Gioca Faithful Manufactor', [pick('Zaun')])
    expect(named(g, 'Recruit')[0].loc).toBe('bf0')
  })

  card('Herald of the Emperor', () => {
    const g = scene()
    const u = add(g, 0, 'Punching Poro', 'board')
    runes(g, 0, ...O(5))
    add(g, 0, 'Herald of the Emperor')
    act(g, 0, 'Gioca Herald of the Emperor', [pick('Punching Poro')])
    expect(might(g, u)).toBe(5)
  })

  card('Party Crasher', () => {
    const g = scene()
    for (let i = 0; i < 3; i++) add(g, 0, 'Punching Poro', 'board').exhausted = true
    runes(g, 0, ...O(6)) // 9 - 3 = 6 energia (una runa anche per la Power)
    add(g, 0, 'Party Crasher')
    act(g, 0, 'Gioca Party Crasher')
    expect(named(g, 'Party Crasher').length).toBe(1)
    expect(kw(g, named(g, 'Party Crasher')[0]).tank).toBe(true)
  })

  card('Meticulous Restorationist', () => {
    const g = scene()
    add(g, 0, 'Meticulous Restorationist', 'trash')
    runes(g, 0, ...O(9))
    add(g, 0, 'Wrath of the Freljord')
    act(g, 0, 'Gioca Wrath of the Freljord', [yes])
    expect(named(g, 'Meticulous Restorationist').length).toBe(1)
  })

  card('Moonlight Affliction', () => {
    const g = scene()
    runes(g, 0, ...M(7))
    const t = add(g, 1, 'Shen, Leader of the Kinkou Order', 'board', 'bf1')
    add(g, 0, 'Moonlight Affliction')
    act(g, 0, 'Gioca Moonlight Affliction', [pick('Shen')])
    expect(might(g, t)).toBe(-3)
  })

  card('For Demacia!', () => {
    const g = scene()
    runes(g, 0, ...O(3))
    const u = add(g, 0, 'Punching Poro', 'board', 'bf0')
    add(g, 0, 'For Demacia!')
    act(g, 0, 'Gioca For Demacia!', [pick('Zaun')])
    expect(kw(g, u).shield).toBe(2)
  })

  card('Black Rose Sanctum', () => {
    const g = scene()
    g.bfs[1].card = byName('Black Rose Sanctum')
    const a = add(g, 1, 'Soulspinner', 'board', 'bf1')
    const b = add(g, 1, 'Mournful Witness', 'board', 'bf1')
    run(g, kill(g, [a], 'test'))
    run(g, kill(g, [b], 'test'))
    expect(named(g, 'Recruit').length).toBe(1) // solo la prima volta nel turno
    expect(named(g, 'Recruit')[0].controller).toBe(1)
  })

  card('Ruined Monastery', () => {
    const g = scene()
    g.bfs[1].card = byName('Ruined Monastery')
    add(g, 0, 'Charm')
    add(g, 0, 'Punching Poro', 'board')
    act(g, 0, 'Muovi', [pick('Punching Poro'), pick('Ruined'), yes, pick('Charm')], passAll)
    expect(g.players[0].runes.length).toBe(1)
    expect(g.objs.get(g.players[0].runes[0])!.exhausted).toBe(true)
  })
})

void spawn
