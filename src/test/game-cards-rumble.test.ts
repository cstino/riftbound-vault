// Carte del mazzo Rumble (Spiritforged): ogni test verifica il testo stampato della carta.
import { describe, expect, it } from 'vitest'
import { kill, kw, might, playToken, scoreBf, settle, spawn, units } from '../lib/game/engine'
import { MECH } from '../lib/game/cards-rumble'
import type { Decision, Game } from '../lib/game/types'
import { act, add, drive, logText, pick, runes, scene, top, yes } from './gameScene'
import { byName } from './gameHelpers'

function card(name: string, fn: () => void) {
  it(name, fn)
}

const names = (g: Game, list: number[]) => list.map((u) => g.objs.get(u)!.card.name)
const named = (g: Game, name: string) => units(g).filter((u) => u.card.name === name)
const passAll = (d: Decision) => (d.type === 'act' ? 'pass' : undefined)
const mech = (g: Game, p: 0 | 1 = 0, loc: 'base0' | 'base1' | 'bf0' | 'bf1' = 'base0') => spawn(g, MECH, p, 'board', loc)
const legendIs = (g: Game, p: 0 | 1, name: string) => (g.objs.get(g.players[p].legend)!.card = byName(name))
const run = (g: Game, gen: Generator<Decision, unknown, unknown>) =>
  drive(
    (function* () {
      yield* gen as never
      yield* settle(g)
    })(),
  )

describe('carte del mazzo Rumble (Spiritforged)', () => {
  card('Mech', () => {
    const g = scene()
    const m = mech(g)
    expect(might(g, m)).toBe(3)
    expect(m.card.tags).toContain('Mech')
  })

  card('Rumble - Mechanized Menace', () => {
    const g = scene()
    legendIs(g, 0, 'Rumble - Mechanized Menace')
    const m = mech(g)
    const other = add(g, 0, 'Punching Poro', 'board')
    expect(kw(g, m).shield).toBe(1)
    expect(kw(g, other).shield).toBe(0)
  })

  card('Rumble, Hotheaded', () => {
    const g = scene()
    const r = add(g, 0, 'Rumble, Hotheaded', 'board')
    const m = mech(g)
    expect(kw(g, m).assault).toBe(1)
    expect(kw(g, r).assault).toBe(1) // è un Mech anche lui
    // conquista: ricicla un'altra unità per giocare un Mech dal trash con lo sconto
    runes(g, 0, 'Fury', 'Fury')
    add(g, 0, 'Bubble Bot', 'trash') // 3 energia, meno 3 di Might del Mech riciclato = 0
    act(g, 0, 'Muovi', [pick('Rumble, Hotheaded'), pick('Grove'), yes, pick('Mech'), pick('Bubble Bot')], passAll)
    expect(named(g, 'Bubble Bot').length).toBe(1)
    expect(named(g, 'Mech').length).toBe(0) // riciclato (un token smette di esistere)
  })

  card('Rumble, Scrapper', () => {
    const g = scene()
    g.bfs[1].controller = 0
    const r = add(g, 0, 'Rumble, Scrapper', 'board', 'bf1')
    expect(might(g, r)).toBe(5) // +1 a sé stesso
    run(g, scoreBf(g, 0, 'bf1', 'hold'))
    expect(named(g, 'Mech').length).toBe(1)
  })

  card('Breakneck Mech', () => {
    const g = scene()
    runes(g, 0, 'Mind', 'Mind', 'Mind', 'Mind', 'Mind', 'Mind', 'Mind', 'Mind', 'Mind', 'Mind')
    const m = mech(g)
    add(g, 0, 'Breakneck Mech')
    act(g, 0, 'Gioca Breakneck Mech')
    const b = named(g, 'Breakneck Mech')[0]
    expect(b.exhausted).toBe(false) // controlli un altro Mech
    expect(kw(g, m)).toMatchObject({ deflect: 1, ganking: true })
  })

  card('Forecaster', () => {
    const g = scene()
    add(g, 0, 'Forecaster', 'board')
    top(g, 0, 'Charm')
    run(g, playToken(g, 0, MECH, 'base0'))
    expect(logText(g)).toMatch(/Predict 1/)
    // un non-Mech non fa Predict
    const h = scene()
    add(h, 0, 'Forecaster', 'board')
    run(h, playToken(h, 0, MECH, 'base0'))
    const before = h.log.filter((l) => l.text.includes('Predict')).length
    runes(h, 0, 'Fury', 'Fury')
    add(h, 0, 'Punching Poro')
    act(h, 0, 'Gioca Punching Poro')
    expect(h.log.filter((l) => l.text.includes('Predict')).length).toBe(before)
  })

  card('Bubble Bot', () => {
    const g = scene()
    runes(g, 0, 'Mind', 'Mind', 'Mind')
    const m = mech(g)
    m.exhausted = true
    add(g, 0, 'Bubble Bot')
    act(g, 0, 'Gioca Bubble Bot', [pick('Mech')])
    expect(m.exhausted).toBe(false)
  })

  card('Consult the Past', () => {
    const g = scene()
    runes(g, 0, 'Mind', 'Mind', 'Mind', 'Mind')
    add(g, 0, 'Consult the Past')
    act(g, 0, 'Gioca Consult the Past')
    expect(g.players[0].hand.length).toBe(2)
  })

  card('Danger Zone', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Mind', 'Mind')
    const m = mech(g)
    const o = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Danger Zone')
    act(g, 0, 'Gioca Danger Zone', [yes])
    expect(might(g, m)).toBe(5) // +1 due volte con Repeat
    expect(might(g, o)).toBe(2)
  })

  card('Dangerous Duo', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury')
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Dangerous Duo')
    act(g, 0, 'Gioca Dangerous Duo')
    expect(might(g, u)).toBe(2) // prima carta del turno: niente Legion
    add(g, 0, 'Dangerous Duo')
    act(g, 0, 'Gioca Dangerous Duo', [pick('Punching Poro')])
    expect(might(g, u)).toBe(4)
  })

  card('Ferrous Forerunner', () => {
    const g = scene()
    const f = add(g, 0, 'Ferrous Forerunner', 'board', 'bf1')
    run(g, kill(g, [f], 'test'))
    expect(named(g, 'Mech').map((m) => m.loc)).toEqual(['base0', 'base0'])
  })

  card('Frigid Touch', () => {
    const g = scene()
    runes(g, 0, 'Mind', 'Mind', 'Mind', 'Mind')
    const t = add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    add(g, 0, 'Frigid Touch')
    act(g, 0, 'Gioca Frigid Touch', [yes, pick('Pakaa Protector'), pick('Pakaa Protector')])
    expect(might(g, t)).toBe(0)
  })

  card('Gem Jammer', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury')
    const u = add(g, 0, 'Punching Poro', 'board', 'bf0')
    add(g, 0, 'Gem Jammer')
    act(g, 0, 'Gioca Gem Jammer', [pick('Punching Poro')])
    expect(kw(g, u).ganking).toBe(true)
  })

  card('Long Sword', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury')
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Long Sword')
    act(g, 0, 'Gioca Long Sword', [pick('Punching Poro')])
    expect(might(g, u)).toBe(4) // Quick-Draw: si attacca subito, +2
  })

  card('Minefield', () => {
    const g = scene()
    g.bfs[1].card = byName('Minefield')
    add(g, 0, 'Punching Poro', 'board')
    act(g, 0, 'Muovi', [pick('Punching Poro'), pick('Minefield')], passAll)
    expect(g.players[0].trash.length).toBe(2)
  })

  card('Plundering Poro', () => {
    const g = scene()
    add(g, 0, 'Plundering Poro', 'board')
    act(g, 0, 'Muovi', [pick('Plundering Poro'), pick('Grove')], passAll)
    expect([...g.objs.values()].filter((o) => o.zone === 'board' && o.card.name === 'Gold').length).toBe(1)
  })

  card('Production Surge', () => {
    const g = scene()
    runes(g, 0, 'Mind', 'Mind', 'Mind')
    mech(g)
    add(g, 0, 'Production Surge') // 4 - 2 = 2 energia e 1 Power
    act(g, 0, 'Gioca Production Surge')
    expect(named(g, 'Mech').length).toBe(2)
    expect(g.players[0].hand.length).toBe(1)
  })

  card('Ravenbloom Conservatory', () => {
    const g = scene()
    g.turnPlayer = 1
    g.bfs[0].card = byName('Ravenbloom Conservatory')
    g.bfs[0].controller = 0
    add(g, 0, 'Sacred Protector', 'board', 'bf0')
    top(g, 0, 'Charm')
    add(g, 1, 'Soulspinner', 'board')
    act(g, 1, 'Muovi', [pick('Soulspinner'), pick('Ravenbloom')], passAll)
    expect(names(g, g.players[0].hand)).toEqual(['Charm'])
  })

  card('Singularity', () => {
    const g = scene()
    runes(g, 0, 'Mind', 'Mind', 'Mind', 'Mind', 'Mind', 'Mind')
    const a = add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    const b = add(g, 1, 'Soulspinner', 'board', 'bf1')
    add(g, 0, 'Singularity')
    act(g, 0, 'Gioca Singularity', [pick('Pakaa Protector'), yes, pick('Soulspinner')])
    expect(g.objs.has(a.uid) || g.objs.has(b.uid)).toBe(false)
  })

  card('Stupefy', () => {
    const g = scene()
    runes(g, 0, 'Mind', 'Mind')
    const t = add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    add(g, 0, 'Stupefy')
    act(g, 0, 'Gioca Stupefy', [pick('Pakaa Protector')])
    expect(might(g, t)).toBe(3)
    expect(g.players[0].hand.length).toBe(1)
    // a 1 Might non scende
    const h = scene()
    runes(h, 0, 'Mind')
    const s = add(h, 1, 'Disciple of Shen', 'board', 'bf1')
    add(h, 0, 'Stupefy')
    act(h, 0, 'Gioca Stupefy', [pick('Disciple of Shen')])
    expect(might(h, s)).toBe(1)
  })

  card('Treasure Hoard', () => {
    const g = scene()
    g.bfs[1].card = byName('Treasure Hoard')
    runes(g, 0, 'Fury')
    add(g, 0, 'Punching Poro', 'board')
    act(g, 0, 'Muovi', [pick('Punching Poro'), pick('Treasure'), yes], passAll)
    expect([...g.objs.values()].filter((o) => o.zone === 'board' && o.card.name === 'Gold').length).toBe(1)
  })

  card('Void Seeker', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury')
    const t = add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    add(g, 0, 'Void Seeker')
    act(g, 0, 'Gioca Void Seeker', [pick('Pakaa Protector')])
    expect(g.objs.has(t.uid)).toBe(false)
    expect(g.players[0].hand.length).toBe(1)
  })

  card('Wages of Pain', () => {
    const g = scene()
    runes(g, 0, 'Mind', 'Mind', 'Mind')
    const t = add(g, 1, 'Soulspinner', 'board', 'bf1')
    add(g, 0, 'Wages of Pain')
    act(g, 0, 'Gioca Wages of Pain', [pick('Soulspinner')])
    expect(g.objs.has(t.uid)).toBe(false)
    expect([...g.objs.values()].filter((o) => o.zone === 'board' && o.card.name === 'Gold').length).toBe(1)
  })

  card('Assembly Rig', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury')
    add(g, 0, 'Punching Poro', 'trash')
    add(g, 0, 'Assembly Rig')
    act(g, 0, 'Gioca Assembly Rig')
    act(g, 0, 'Assembly Rig: Ricicla', [pick('Punching Poro')])
    expect(named(g, 'Mech').length).toBe(1)
    expect(g.players[0].trash.length).toBe(0)
  })
})

