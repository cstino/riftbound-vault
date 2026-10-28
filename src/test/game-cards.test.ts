// Ogni carta implementata nel motore ha qui almeno un test sul suo testo stampato.
import { describe, expect, it } from 'vitest'
import { available, banish, kill, kw, might, settle, standardDests, units } from '../lib/game/engine'
import type { Decision, Game, Obj, PID } from '../lib/game/types'
import { act, add, drive, logText, pick, runes, scene, top, yes, no } from './gameScene'
import { db } from './gameHelpers'

const TESTED = new Set<string>()
function card(name: string, fn: () => void) {
  TESTED.add(name)
  it(name, fn)
}

const names = (g: Game, list: number[]) => list.map((u) => g.objs.get(u)!.card.name)
const unitNamed = (g: Game, name: string) => units(g).filter((u) => u.card.name === name)
const passAll = (d: Decision) => (d.type === 'act' ? 'pass' : undefined)

describe('carte del mazzo Zed (Vendetta)', () => {
  card('Zed - Master of Shadows', () => {
    const g = scene()
    const legend = g.objs.get(g.players[0].legend)!
    // esiliare una carta dell'avversario non lo rende Empowered
    drive(banish(g, add(g, 1, 'Charm', 'trash'), 0))
    drive(settle(g))
    expect(legend.empowered).toBe(false)
    drive(banish(g, add(g, 0, 'Death Mark', 'trash'), 0))
    drive(settle(g))
    expect(legend.empowered).toBe(true)
    add(g, 0, 'Punching Poro')
    top(g, 0, 'Charm')
    act(g, 0, 'Disempower', [pick('Punching Poro')])
    expect(legend.empowered).toBe(false)
    expect(legend.exhausted).toBe(true)
    expect(names(g, g.players[0].hand)).toEqual(['Charm'])
  })

  card('Zed, Without a Sound', () => {
    const g = scene()
    const zed = add(g, 0, 'Zed, Without a Sound', 'board')
    act(g, 0, 'Muovi', [pick('Zed, Without a Sound'), pick('Grove')])
    const clone = unitNamed(g, 'Shadow Clone')[0]
    expect(clone.loc).toBe('base0')
    runes(g, 0, 'Chaos', 'Fury')
    act(g, 0, 'Scambia posto', [pick('Shadow Clone')])
    expect(zed.loc).toBe('base0')
    expect(clone.loc).toBe('bf1')
  })

  card('Zed, From the Shadows', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Fury')
    g.players[0].champion = null
    add(g, 0, 'Zed, From the Shadows')
    add(g, 0, 'Charm')
    act(g, 0, 'Gioca Zed, From the Shadows', [yes, pick('Charm')])
    expect(names(g, g.players[0].trash)).toEqual(['Charm'])
    expect(unitNamed(g, 'Shadow Clone').length).toBe(1)
    // senza pagare il costo aggiuntivo niente token
    const h = scene()
    runes(h, 0, 'Fury', 'Fury', 'Fury', 'Fury')
    add(h, 0, 'Zed, From the Shadows')
    add(h, 0, 'Charm')
    act(h, 0, 'Gioca Zed, From the Shadows', [no])
    expect(unitNamed(h, 'Shadow Clone').length).toBe(0)
  })

  card('Mel, Defiant Soul', () => {
    const g = scene()
    add(g, 0, 'Mel, Defiant Soul', 'board')
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    add(g, 0, 'Death Mark')
    add(g, 0, 'Punching Poro')
    expect(available(g, 0).some((a) => a.label.includes('Mel, Defiant Soul: Empower'))).toBe(true)
    act(g, 0, 'Mel, Defiant Soul: Empower', [pick('Death Mark'), pick('Soulspinner')])
    expect(names(g, g.players[0].trash)).toEqual(['Death Mark'])
    expect(names(g, g.players[1].banish)).toEqual(['Soulspinner'])
  })

  card('Morgana, Vindictive', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Fury', 'Fury')
    const t = add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    t.damage = 2
    add(g, 0, 'Morgana, Vindictive')
    act(g, 0, 'Gioca Morgana', [pick('Pakaa Protector')])
    expect(names(g, g.players[1].trash)).toEqual(['Pakaa Protector']) // 2 + 2 = 4 danni letali
    // Ambush: si gioca come Reaction in un campo dove si hanno unità
    const h = scene()
    runes(h, 0, 'Fury', 'Fury', 'Fury', 'Fury', 'Fury')
    h.bfs[0].controller = 1
    add(h, 1, 'Sacred Protector', 'board', 'bf0')
    add(h, 0, 'Shadow Assassin', 'board')
    add(h, 0, 'Morgana, Vindictive')
    let offered = false
    act(h, 0, 'Muovi', [pick('Shadow Assassin'), pick('Zaun')], (d) => {
      if (d.type === 'act' && d.player === 0 && d.context === 'showdown') {
        const a = d.actions.find((x) => x.label.includes('Morgana'))
        offered ||= !!a
        return a?.id ?? 'pass'
      }
      return d.type === 'act' ? 'pass' : undefined
    })
    expect(offered).toBe(true)
    expect(unitNamed(h, 'Morgana, Vindictive').length).toBe(1)
  })

  card('Death Mark', () => {
    const g = scene()
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos')
    add(g, 0, 'Death Mark', 'trash')
    // Flow: 1 energia e 2 Power di qualsiasi dominio, poi viene esiliata
    act(g, 0, 'Death Mark dal trash')
    expect(g.players[0].trash.length).toBe(3) // Burn 3
    expect(unitNamed(g, 'Shadow Clone').length).toBe(1)
    expect(names(g, g.players[0].banish)).toEqual(['Death Mark'])
    expect(g.objs.get(g.players[0].legend)!.empowered).toBe(true)
  })

  card('Twilight Reveler', () => {
    const g = scene()
    g.bfs[1].controller = 1
    add(g, 1, 'Steel Paws', 'board', 'bf1')
    add(g, 0, 'Twilight Reveler', 'board')
    const tired = add(g, 0, 'Punching Poro', 'board')
    tired.exhausted = true
    act(g, 0, 'Muovi', [pick('Twilight Reveler'), pick('Grove'), pick('Punching Poro')])
    expect(tired.exhausted).toBe(false)
  })

  card('Twilight Step', () => {
    const g = scene()
    runes(g, 0, 'Chaos', 'Chaos')
    const t = add(g, 1, 'Soulspinner', 'board', 'bf1')
    add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    add(g, 0, 'Twilight Step')
    const offered: string[] = []
    act(g, 0, 'Twilight Step', [(d) => {
      if (d.type === 'choose') offered.push(...d.options.map((o) => o.label))
      return pick('Soulspinner')(d)
    }, pick('Base di Shen')])
    expect(offered).not.toContain('Pakaa Protector') // 4 Might
    expect(t.loc).toBe('base1')
  })

  card('Perfect Execution', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury')
    const u = add(g, 0, 'Punching Poro', 'board')
    u.exhausted = true
    add(g, 0, 'Perfect Execution')
    act(g, 0, 'Perfect Execution', [pick('Punching Poro')])
    expect(u.exhausted).toBe(false)
    expect(kw(g, u).assault).toBe(3)
  })

  card('Wind and Ghosts', () => {
    const g = scene()
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos', 'Chaos', 'Chaos', 'Chaos')
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    add(g, 0, 'Wind and Ghosts')
    add(g, 0, 'Wind and Ghosts')
    act(g, 0, 'Wind and Ghosts', [pick('Soulspinner')])
    act(g, 0, 'Wind and Ghosts', [pick('Pakaa Protector')])
    expect(names(g, g.players[1].banish)).toEqual(['Soulspinner'])
    expect(names(g, g.players[1].hand)).toEqual(['Pakaa Protector'])
  })

  card('Gust Monk', () => {
    const g = scene()
    runes(g, 0, 'Chaos', 'Chaos', 'Chaos')
    add(g, 1, 'Charm', 'trash')
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Gust Monk')
    act(g, 0, 'Gust Monk', [yes, pick('Charm'), pick('Punching Poro')])
    expect(names(g, g.players[1].banish)).toEqual(['Charm'])
    expect(kw(g, u).assault).toBe(2)
  })

  card('Shadow Fiend', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury')
    const u = add(g, 0, 'Shadow Fiend', 'board')
    expect(kw(g, u).assault).toBe(0)
    act(g, 0, 'Shadow Fiend: Empower')
    expect(u.empowered).toBe(true)
    expect(kw(g, u).assault).toBe(3)
    expect(available(g, 0).some((a) => a.label.includes('Shadow Fiend: Empower'))).toBe(false)
  })

  card('Shadow Assassin', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury')
    add(g, 0, 'Shadow Assassin')
    act(g, 0, 'Shadow Assassin')
    expect(unitNamed(g, 'Shadow Assassin')[0].exhausted).toBe(true)
    add(g, 0, 'Shadow Assassin', 'trash')
    add(g, 0, 'Shadow Assassin')
    act(g, 0, 'Shadow Assassin')
    expect(unitNamed(g, 'Shadow Assassin').filter((u) => !u.exhausted).length).toBe(1)
  })

  card('Ravenbloom Prefect', () => {
    const g = scene()
    g.turnPlayer = 1
    add(g, 0, 'Ravenbloom Prefect', 'board')
    runes(g, 1, 'Calm', 'Calm')
    add(g, 1, 'Hand Hammer')
    act(g, 1, 'Hand Hammer', [yes])
    expect(names(g, g.players[0].banish)).toEqual(['Ravenbloom Prefect'])
    expect(names(g, g.players[1].banish)).toEqual(['Hand Hammer'])
    expect(g.objs.get(g.players[0].legend)!.empowered).toBe(true) // ha esiliato una sua carta
  })

  card('Traveling Merchant', () => {
    const g = scene()
    add(g, 0, 'Traveling Merchant', 'board')
    add(g, 0, 'Charm')
    top(g, 0, 'Death Mark')
    act(g, 0, 'Muovi', [pick('Traveling Merchant'), pick('Grove')])
    expect(names(g, g.players[0].trash)).toEqual(['Charm'])
    expect(names(g, g.players[0].hand)).toEqual(['Death Mark'])
  })

  card('Shadow Order Disciple', () => {
    const g = scene()
    const u = add(g, 0, 'Shadow Order Disciple', 'board')
    top(g, 0, 'Charm')
    act(g, 0, 'Muovi', [pick('Shadow Order Disciple'), pick('Grove'), yes])
    expect(names(g, g.players[0].trash)).toEqual(['Charm'])
    expect(might(g, u)).toBe(3)
  })

  card('Punching Poro', () => {
    const g = scene()
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Charm')
    act(g, 0, 'Punching Poro: Empower', [pick('Charm')])
    expect(might(g, u)).toBe(3)
  })

  card('Ruthless Strike', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury')
    const a = add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    const b = add(g, 1, 'Shen, Scourge of Shadows', 'board', 'bf1')
    add(g, 0, 'Ruthless Strike')
    add(g, 0, 'Ruthless Strike')
    add(g, 0, 'Charm')
    act(g, 0, 'Ruthless Strike', [no, pick('Shen, Scourge')])
    expect(b.damage).toBe(3)
    act(g, 0, 'Ruthless Strike', [yes, pick('Pakaa Protector'), pick('Charm')])
    expect(g.objs.has(a.uid)).toBe(false) // 5 danni: muore
  })

  card('Shadowblade Lurker', () => {
    const g = scene()
    runes(g, 0, 'Chaos')
    add(g, 0, 'Shadowblade Lurker', 'trash')
    add(g, 0, 'Shadowblade Lurker', 'trash')
    add(g, 0, 'Shadowblade Lurker')
    act(g, 0, 'Shadowblade Lurker') // 5 - 2×2 = 1 energia
    expect(unitNamed(g, 'Shadowblade Lurker').length).toBe(1)
  })

  card('Blade Twirler', () => {
    const g = scene()
    add(g, 0, 'Blade Twirler', 'board')
    act(g, 0, 'Muovi', [pick('Blade Twirler'), pick('Grove'), pick('Shen')])
    expect(g.players[1].trash.length).toBe(1)
    unitNamed(g, 'Blade Twirler')[0].exhausted = false
    act(g, 0, 'Muovi', [pick('Blade Twirler'), pick('La tua base')])
    expect(g.players[1].trash.length).toBe(1) // solo la prima volta in ogni turno
  })

  card('Kinkou Lifeblade', () => {
    const g = scene()
    runes(g, 0, 'Chaos', 'Chaos')
    const u = add(g, 0, 'Kinkou Lifeblade', 'board', 'bf0')
    expect(standardDests(g, u)).toEqual(['base0'])
    act(g, 0, 'Kinkou Lifeblade: Empower')
    expect(might(g, u)).toBe(5)
    expect(standardDests(g, u)).toContain('bf1') // Ganking
  })

  card('Zaun Warrens', () => {
    const g = scene()
    add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Charm')
    top(g, 0, 'Death Mark')
    act(g, 0, 'Muovi', [pick('Punching Poro'), pick('Zaun'), pick('Charm')])
    expect(names(g, g.players[0].trash)).toEqual(['Charm'])
    expect(names(g, g.players[0].hand)).toEqual(['Death Mark'])
  })

  card('Shadow Temple', () => {
    const g = scene()
    g.bfs[0].card = db.cards.find((c) => c.name === 'Shadow Temple')!
    g.bfs[0].controller = 0
    add(g, 0, 'Punching Poro', 'board', 'bf0')
    const gen = (function* () {
      const { scoreBf } = engine
      yield* scoreBf(g, 0, 'bf0', 'hold')
      yield* settle(g)
    })()
    drive(gen)
    expect(g.players[0].points).toBe(1)
    expect(g.players[0].trash.length).toBe(3)
  })

  card('Threshold of the Gray', () => {
    const g = scene()
    g.bfs[1].card = db.cards.find((c) => c.name === 'Threshold of the Gray')!
    g.bfs[1].controller = 1
    add(g, 1, 'Sacred Protector', 'board', 'bf1')
    add(g, 0, 'Punching Poro', 'board')
    act(g, 0, 'Muovi', [pick('Punching Poro'), pick('Threshold')])
    expect(logText(g)).toMatch(/Zed aggiunge 1 energia/)
    expect(logText(g)).toMatch(/Shen aggiunge 1 energia/)
  })
})

import * as engine from '../lib/game/engine'

describe('carte del mazzo Shen (Vendetta)', () => {
  card('Shen - Eye of Twilight', () => {
    const g = scene()
    g.turnPlayer = 1
    const u = add(g, 1, 'Mournful Witness', 'board')
    act(g, 1, 'Esaurisci', [pick('Mournful Witness')])
    expect(kw(g, u).tank).toBe(true)
    expect(g.objs.get(g.players[1].legend)!.exhausted).toBe(true)
  })

  const hold = (g: Game, p: PID, loc: 'bf0' | 'bf1') =>
    drive(
      (function* () {
        yield* engine.scoreBf(g, p, loc, 'hold')
        yield* settle(g)
      })(),
    )

  card('Shen, Leader of the Kinkou Order', () => {
    const g = scene()
    g.bfs[1].controller = 1
    add(g, 1, 'Shen, Leader of the Kinkou Order', 'board', 'bf1')
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    hold(g, 1, 'bf1')
    expect(g.players[1].points).toBe(2) // tenuta + abilità
    expect(kw(g, unitNamed(g, 'Shen, Leader of the Kinkou Order')[0]).shield).toBe(1)
  })

  card('Shen, Scourge of Shadows', () => {
    const g = scene()
    g.bfs[1].card = db.cards.find((c) => c.name === 'Kinkou Temple')!
    g.bfs[1].controller = 1
    add(g, 1, 'Shen, Scourge of Shadows', 'board', 'bf1')
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    hold(g, 1, 'bf1')
    expect(g.players[1].hand.length).toBe(1)
    const h = scene()
    h.bfs[1].card = g.bfs[1].card
    h.bfs[1].controller = 1
    add(h, 1, 'Shen, Scourge of Shadows', 'board', 'bf1')
    add(h, 1, 'Soulspinner', 'board', 'bf1')
    add(h, 1, 'Mournful Witness', 'board', 'bf1')
    hold(h, 1, 'bf1')
    expect(h.players[1].hand.length).toBe(0) // due altre unità: niente
  })

  card('Shen, Kinkou', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury')
    runes(g, 1, 'Order', 'Order', 'Order')
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    g.bfs[1].controller = 1
    add(g, 0, 'Ruthless Strike')
    add(g, 1, 'Shen, Kinkou')
    act(g, 0, 'Ruthless Strike', [pick('Soulspinner'), pick('Shen, Kinkou'), pick('Grove')])
    const shen = unitNamed(g, 'Shen, Kinkou')[0]
    expect(shen.loc).toBe('bf1')
    expect(kw(g, shen)).toMatchObject({ shield: 2, tank: true })
  })

  card('Shadow Dash', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Calm', 'Calm')
    g.bfs[1].controller = 1
    const a = add(g, 1, 'Soulspinner', 'board', 'bf1')
    const b = add(g, 1, 'Mournful Witness', 'board', 'bf1')
    const t = add(g, 0, 'Punching Poro', 'board')
    add(g, 1, 'Shadow Dash')
    act(g, 1, 'Shadow Dash', [pick('Punching Poro'), pick('Grove')], passAll)
    expect(logText(g)).toMatch(/Punching Poro si sposta a Grove/)
    expect(might(g, a)).toBe(4)
    // Mournful Witness: 2 + 1 di Shadow Dash + 2 da Empowered dopo il combattimento che segue
    expect(might(g, b)).toBe(5)
    expect(g.objs.has(t.uid)).toBe(false) // Punching Poro muore nel combattimento
  })

  card('Steel Paws', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Calm', 'Calm', 'Calm', 'Calm', 'Calm', 'Calm', 'Calm')
    const u = add(g, 1, 'Steel Paws', 'board')
    expect(kw(g, u).deflect).toBe(1)
    act(g, 1, 'Steel Paws: Empower')
    expect(might(g, u)).toBe(7)
  })

  card('Kennen, Keeper of Balance', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Order', 'Order', 'Order', 'Order', 'Order')
    g.bfs[0].controller = 0
    const e = add(g, 0, 'Punching Poro', 'board', 'bf0')
    add(g, 1, 'Kennen, Keeper of Balance')
    act(g, 1, 'Gioca Kennen', [yes, pick('Punching Poro')], passAll)
    const k = unitNamed(g, 'Kennen, Keeper of Balance')[0]
    expect(e.stunned).toBe(true)
    expect(might(g, k)).toBe(2)
    k.loc = 'bf0'
    expect(might(g, k)).toBe(4) // +2 con un'unità nemica stordita qui
  })

  card('Sacred Protector', () => {
    const g = scene()
    const u = add(g, 1, 'Sacred Protector', 'board', 'bf1')
    expect(engine.toCombatUnit(g, u).stunned).toBe(true) // da solo non infligge danni
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    expect(engine.toCombatUnit(g, u).stunned).toBe(false)
  })

  card('Resonating Strike', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Calm', 'Calm')
    g.bfs[1].controller = 1
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    const u = add(g, 1, 'Mournful Witness', 'board')
    add(g, 1, 'Resonating Strike')
    act(g, 1, 'Resonating Strike', [pick('Grove'), pick('Mournful Witness')])
    expect(u.loc).toBe('bf1')
    expect(might(g, u)).toBe(4)
  })

  card('Ki Barrier', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Order', 'Order')
    const u = add(g, 1, 'Soulspinner', 'board', 'bf1')
    add(g, 1, 'Ki Barrier')
    act(g, 1, 'Ki Barrier', [pick('Soulspinner')])
    engine.deal(g, u, 9, 'test')
    expect(u.damage).toBe(2)
  })

  card('Discipline', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Calm', 'Calm')
    const u = add(g, 1, 'Soulspinner', 'board')
    add(g, 1, 'Discipline')
    act(g, 1, 'Discipline', [pick('Soulspinner')])
    expect(might(g, u)).toBe(5)
    expect(g.players[1].hand.length).toBe(1)
  })

  card('Noxian Emissary', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Order', 'Order')
    const u = add(g, 1, 'Noxian Emissary', 'board')
    act(g, 1, 'Noxian Emissary: Empower')
    drive((function* () {
      yield* kill(g, [u], 'test')
      yield* settle(g)
    })())
    expect(unitNamed(g, 'Recruit').map((r) => [r.controller, might(g, r)])).toEqual([[1, 1], [1, 1]])
    // senza Empowered non succede nulla
    const h = scene()
    const v = add(h, 1, 'Noxian Emissary', 'board')
    drive((function* () {
      yield* kill(h, [v], 'test')
      yield* settle(h)
    })())
    expect(unitNamed(h, 'Recruit').length).toBe(0)
  })

  card('Pakaa Protector', () => {
    const g = scene()
    g.turnPlayer = 1
    const u = add(g, 1, 'Pakaa Protector', 'board')
    top(g, 1, 'Charm')
    act(g, 1, 'Muovi', [pick('Pakaa Protector'), pick('Zaun')])
    expect(names(g, g.players[1].trash)).toEqual(['Charm'])
    expect(might(g, u)).toBe(6)
    const h = scene()
    h.turnPlayer = 1
    const v = add(h, 1, 'Pakaa Protector', 'board')
    top(h, 1, 'Soulspinner')
    act(h, 1, 'Muovi', [pick('Pakaa Protector'), pick('Zaun')])
    expect(names(h, h.players[1].hand)).toEqual(['Soulspinner'])
    expect(might(h, v)).toBe(4)
  })

  card('Lacerate', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Order', 'Order')
    const t = add(g, 0, 'Kinkou Lifeblade', 'board')
    t.empowered = true // 5 Might
    add(g, 1, 'Lacerate')
    act(g, 1, 'Lacerate', [pick('Kinkou Lifeblade')])
    expect(t.empowered).toBe(false)
    expect(g.objs.has(t.uid)).toBe(true) // 4 Might: resta
    runes(g, 1, 'Order', 'Order', 'Order', 'Order')
    const s = add(g, 0, 'Punching Poro', 'board')
    act(g, 1, 'Lacerate dal trash', [pick('Punching Poro')])
    expect(g.objs.has(s.uid)).toBe(false)
    expect(names(g, g.players[1].banish)).toEqual(['Lacerate'])
  })

  card('Mournful Witness', () => {
    const g = scene()
    g.turnPlayer = 1
    g.bfs[0].controller = 0
    add(g, 0, 'Sacred Protector', 'board', 'bf0')
    const u = add(g, 1, 'Mournful Witness', 'board')
    act(g, 1, 'Muovi', [pick('Mournful Witness'), pick('Zaun')])
    expect(u.empowered).toBe(true)
    expect(might(g, u)).toBe(4)
  })

  card('Disciple of Shen', () => {
    const g = scene()
    const u = add(g, 1, 'Disciple of Shen', 'board', 'bf1')
    expect(kw(g, u).shield).toBe(0)
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    expect(kw(g, u).shield).toBe(3)
  })

  card('Hand Hammer', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Calm', 'Calm', 'Calm')
    const u = add(g, 1, 'Soulspinner', 'board')
    add(g, 1, 'Hand Hammer')
    act(g, 1, 'Gioca Hand Hammer')
    act(g, 1, 'Hand Hammer: Equip', [pick('Soulspinner')])
    expect(might(g, u)).toBe(4)
  })

  card('Twilight Shroud', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Calm')
    const u = add(g, 1, 'Soulspinner', 'board', 'bf1')
    add(g, 1, 'Twilight Shroud')
    act(g, 1, 'Twilight Shroud', [pick('Soulspinner')])
    expect(might(g, u)).toBe(4)
    g.turnPlayer = 0
    runes(g, 0, 'Fury', 'Fury', 'Fury')
    add(g, 0, 'Ruthless Strike')
    expect(available(g, 0).some((a) => a.label.includes('Ruthless Strike'))).toBe(false) // nessun bersaglio valido
  })

  card('Soulspinner', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Order', 'Order', 'Order')
    add(g, 1, 'Mournful Witness', 'board', 'bf0')
    add(g, 1, 'Soulspinner')
    let locs: string[] = []
    act(g, 1, 'Gioca Soulspinner', [(d) => {
      if (d.type === 'choose') locs = d.options.map((o) => o.label)
      return pick('Zaun')(d)
    }], passAll)
    expect(locs).toContain('Zaun Warrens') // campo con unità proprie, non controllato
  })

  card('Keeper of Law', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Order', 'Order', 'Order')
    add(g, 1, 'Keeper of Law')
    expect(available(g, 1).some((a) => a.label.includes('Keeper of Law'))).toBe(false)
    g.bfs[1].controller = 1
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    add(g, 1, 'Mournful Witness', 'board', 'bf1')
    act(g, 1, 'Keeper of Law', [pick('La tua base')]) // 3 energia e niente Power
    expect(unitNamed(g, 'Keeper of Law').length).toBe(1)
  })

  card('Field Musicians', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Calm', 'Calm', 'Calm', 'Calm')
    const u = add(g, 1, 'Soulspinner', 'board')
    add(g, 1, 'Field Musicians')
    act(g, 1, 'Field Musicians', [pick('Soulspinner')])
    expect(might(g, u)).toBe(6)
  })

  card('Charm', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Calm')
    g.bfs[0].controller = 0
    const t = add(g, 0, 'Punching Poro', 'board', 'bf0')
    add(g, 1, 'Charm')
    act(g, 1, 'Charm', [pick('Punching Poro'), pick('Base di Zed')])
    expect(t.loc).toBe('base0')
    expect(g.bfs[0].controller).toBeNull()
  })

  card('Serene Ascetic', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Calm', 'Calm', 'Calm')
    const u = add(g, 1, 'Serene Ascetic', 'board')
    act(g, 1, 'Serene Ascetic: Empower')
    expect(kw(g, u)).toMatchObject({ deflect: 1, shield: 3 })
  })

  card('Loyal Poro', () => {
    const g = scene()
    const a = add(g, 1, 'Loyal Poro', 'board', 'bf1')
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    drive((function* () {
      yield* kill(g, [a], 'test')
      yield* settle(g)
    })())
    expect(g.players[1].hand.length).toBe(1)
    const h = scene()
    const b = add(h, 1, 'Loyal Poro', 'board', 'bf1')
    drive((function* () {
      yield* kill(h, [b], 'test')
      yield* settle(h)
    })())
    expect(h.players[1].hand.length).toBe(0)
  })

  card('Dragon Form', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, 'Order', 'Order', 'Order')
    const u = add(g, 1, 'Steel Paws', 'board')
    add(g, 1, 'Dragon Form')
    act(g, 1, 'Dragon Form', [pick('Steel Paws')])
    expect(might(g, u)).toBe(5)
  })

  card('Kinkou Temple', () => {
    const g = scene()
    g.bfs[1].card = db.cards.find((c) => c.name === 'Kinkou Temple')!
    const t = add(g, 1, 'Shen, Kinkou', 'board', 'bf1')
    const s = add(g, 1, 'Soulspinner', 'board', 'bf1')
    expect(might(g, t)).toBe(4)
    expect(might(g, s)).toBe(3)
  })

  card('Grove of the God-Willow', () => {
    const g = scene()
    g.bfs[1].controller = 1
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    hold(g, 1, 'bf1')
    expect(g.players[1].hand.length).toBe(1)
  })
})

describe('token e rune', () => {
  card('Shadow Clone', () => {
    const g = scene()
    g.bfs[1].controller = 1
    add(g, 1, 'Sacred Protector', 'board', 'bf1')
    const c = engine.spawn(g, (engine as typeof engine).tokenCard('Shadow Clone', 0, [], ''), 0, 'board', 'base0')
    c.token = true
    add(g, 0, 'Punching Poro', 'trash')
    act(g, 0, 'Muovi', [pick('Shadow Clone'), pick('Grove'), yes, pick('Punching Poro')], passAll)
    expect(names(g, g.players[0].banish)).toEqual(['Punching Poro'])
    expect(logText(g)).toMatch(/Shadow Clone ottiene \[Assault 4\]/)
  })
  card('Recruit', () => {
    const g = scene()
    const r = engine.spawn(g, engine.tokenCard('Recruit', 1, ['Recruit'], ''), 1, 'board', 'base1')
    expect(might(g, r)).toBe(1)
  })
  for (const r of ['Fury Rune', 'Chaos Rune', 'Calm Rune', 'Order Rune']) {
    card(r, () => {
      const g = scene()
      runes(g, 0, r.split(' ')[0] as 'Fury')
      expect(engine.canPay(g, 0, { energy: 1, power: [[r.split(' ')[0] as 'Fury']] })).toBe(true)
    })
  }
})

export type { Obj }
