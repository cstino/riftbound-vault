// Carte del mazzo Vi (Unleashed): ogni test verifica il testo stampato della carta.
import { describe, expect, it } from 'vitest'
import { available, canPay, kill, kw, might, playToken, settle, spawn, standardDests, units } from '../lib/game/engine'
import { BIRD, GOLD } from '../lib/game/cards-vi'
import type { Game } from '../lib/game/types'
import { act, add, drive, logText, pick, runes, scene, top, yes, no } from './gameScene'
import { byName } from './gameHelpers'

function card(name: string, fn: () => void) {
  it(name, fn)
}

const names = (g: Game, list: number[]) => list.map((u) => g.objs.get(u)!.card.name)
const named = (g: Game, name: string) => units(g).filter((u) => u.card.name === name)
const passAll = (d: import('../lib/game/types').Decision) => (d.type === 'act' ? 'pass' : undefined)
const setBf = (g: Game, i: 0 | 1, name: string) => (g.bfs[i].card = byName(name))
const can = (g: Game, label: string, p: 0 | 1 = 0) => available(g, p).some((a) => a.label.includes(label))

/** Attacco con danni in eccesso: 7 contro Soulspinner (3) = 4 in eccesso. */
function excessAttack(g: Game, script: Parameters<typeof act>[2] = []) {
  g.bfs[1].controller = 1
  add(g, 1, 'Soulspinner', 'board', 'bf1')
  add(g, 0, 'Shadow Assassin', 'board')
  add(g, 0, 'Punching Poro', 'board')
  return act(g, 0, 'Muovi', [pick('Shadow Assassin', 'Punching Poro'), pick('Grove'), ...script], passAll)
}

describe('carte del mazzo Vi (Unleashed)', () => {
  card('Vi - Piltover Enforcer', () => {
    const g = scene()
    const legend = g.objs.get(g.players[0].legend)!
    legend.card = byName('Vi - Piltover Enforcer')
    const tired = add(g, 0, 'Sharkling', 'board')
    tired.exhausted = true
    excessAttack(g, [yes, pick('Sharkling')])
    expect(g.excess).toEqual([0, 0]) // azzerati a fine combattimento
    expect(legend.exhausted).toBe(true)
    expect(tired.exhausted).toBe(false)
  })

  card('Vi, Destructive', () => {
    const g = scene()
    const vi = add(g, 0, 'Vi, Destructive', 'board', 'bf0')
    add(g, 0, 'Charm', 'trash')
    expect(kw(g, vi).ganking).toBe(true)
    act(g, 0, 'Ricicla 1 dal trash', [pick('Charm')])
    expect(might(g, vi)).toBe(4)
    expect(g.players[0].trash.length).toBe(0)
    expect(can(g, 'Ricicla 1 dal trash')).toBe(false) // trash vuoto
  })

  card('Vi, Hotheaded', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury')
    const vi = add(g, 0, 'Vi, Hotheaded', 'board')
    expect(kw(g, vi).deflect).toBe(1)
    act(g, 0, 'Raddoppia')
    expect(might(g, vi)).toBe(6)
  })

  card('Vi, Peacekeeper', () => {
    const g = scene()
    g.bfs[1].controller = 1
    const e = add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    add(g, 0, 'Vi, Peacekeeper', 'board')
    act(g, 0, 'Muovi', [pick('Vi, Peacekeeper'), pick('Grove'), pick('Pakaa Protector')], passAll)
    expect(logText(g)).toMatch(/Pakaa Protector è stordita/)
    expect(g.objs.has(e.uid)).toBe(false) // stordita non infligge danni e muore contro 5
  })

  card('Vault Breaker', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury')
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Vault Breaker')
    act(g, 0, 'Vault Breaker', [pick('Punching Poro')])
    expect(kw(g, u)).toMatchObject({ assault: 2, ganking: true })
  })

  card('Inferna', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury')
    g.bfs[1].controller = 1
    add(g, 1, 'Sacred Protector', 'board', 'bf1')
    add(g, 0, 'Shadow Assassin', 'board')
    add(g, 0, 'Inferna')
    let offered = false
    act(g, 0, 'Muovi', [pick('Shadow Assassin'), pick('Grove')], (d) => {
      if (d.type === 'act' && d.player === 0 && d.context === 'showdown') {
        const a = d.actions.find((x) => x.label.includes('Inferna'))
        offered ||= !!a
        return a?.id ?? 'pass'
      }
      return d.type === 'act' ? 'pass' : undefined
    })
    expect(offered).toBe(true) // Ambush
    expect(kw(g, add(g, 0, 'Inferna', 'board')).assault).toBe(2)
  })

  card('Crimson Pigeons', () => {
    const g = scene()
    const p = add(g, 0, 'Crimson Pigeons', 'board', 'bf1')
    const o = add(g, 0, 'Punching Poro', 'board', 'bf1')
    p.role = 'attacker'
    expect(might(g, p)).toBe(3)
    o.role = 'attacker'
    expect(might(g, p)).toBe(5)
  })

  card('Sharkling', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Fury')
    add(g, 0, 'Sharkling')
    act(g, 0, 'Gioca Sharkling', [yes])
    const s = named(g, 'Sharkling')[0]
    expect(s.exhausted).toBe(false) // Accelerate
    expect(g.players[0].runes.length).toBe(3) // 4 energia: una runa riciclata per la Power
    expect(kw(g, s).assault).toBe(4)
  })

  card('Square Up', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Fury')
    const a = add(g, 0, 'Punching Poro', 'board')
    const b = add(g, 0, 'Shadow Fiend', 'board')
    add(g, 0, 'Square Up')
    add(g, 0, 'Charm')
    act(g, 0, 'Square Up', [yes, pick('Punching Poro'), pick('Shadow Fiend'), pick('Charm')])
    expect(kw(g, a).assault).toBe(4)
    expect(kw(g, b).assault).toBe(4)
    expect(names(g, g.players[0].trash)).toContain('Charm')
  })

  card('Hextech Gauntlets', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Order')
    const u = add(g, 0, 'Shadow Assassin', 'board') // 5 Might: l'Equip costa 0 energia + [A]
    add(g, 0, 'Hextech Gauntlets')
    act(g, 0, 'Gioca Hextech Gauntlets')
    expect(g.players[0].runes.filter((r) => !g.objs.get(r)!.exhausted).length).toBe(1)
    act(g, 0, 'Hextech Gauntlets: Equip', [pick('Shadow Assassin')])
    expect(might(g, u)).toBe(8)
  })

  card('Right of Conquest', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Fury')
    g.bfs[0].controller = 0
    add(g, 0, 'Punching Poro', 'board', 'bf0')
    add(g, 0, 'Right of Conquest')
    act(g, 0, 'Right of Conquest')
    expect(g.players[0].hand.length).toBe(2)
  })

  card('Arena Kingpin', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Fury', 'Fury')
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Arena Kingpin')
    act(g, 0, 'Gioca Arena Kingpin')
    expect(named(g, 'Arena Kingpin')[0].exhausted).toBe(false) // I enter ready
    act(g, 0, 'Arena Kingpin: Esaurisci', [pick('Punching Poro')])
    expect(might(g, u)).toBe(5)
  })

  card('Lord Broadmane', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury')
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Lord Broadmane')
    act(g, 0, 'Gioca Lord Broadmane', [pick('La tua base')])
    expect(kw(g, u).assault).toBe(1)
    expect(kw(g, named(g, 'Lord Broadmane')[0]).assault).toBe(0)
  })

  card('Towering Pairofant', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury', 'Fury')
    add(g, 0, 'Towering Pairofant')
    act(g, 0, 'Gioca Towering Pairofant')
    expect(named(g, 'Towering Pairofant')[0].exhausted).toBe(true)
    drive(kill(g, [add(g, 1, 'Soulspinner', 'board', 'bf1')], 'test'))
    add(g, 0, 'Towering Pairofant')
    act(g, 0, 'Gioca Towering Pairofant')
    expect(named(g, 'Towering Pairofant').some((u) => !u.exhausted)).toBe(true)
    expect(kw(g, named(g, 'Towering Pairofant')[0]).assault).toBe(1)
  })

  card('Yeti Brawler', () => {
    const g = scene()
    g.bfs[1].controller = 1
    add(g, 1, 'Mournful Witness', 'board', 'bf1') // 2 Might: 6 assegnati = 4 in eccesso
    add(g, 0, 'Yeti Brawler', 'board')
    act(g, 0, 'Muovi', [pick('Yeti Brawler'), pick('Grove')], passAll)
    const gold = [...g.objs.values()].filter((o) => o.zone === 'board' && o.card.name === 'Gold')
    expect(gold.length).toBe(2)
    expect(gold.every((o) => o.exhausted && o.loc === 'base0')).toBe(true)
  })

  card('Gold', () => {
    const g = scene()
    add(g, 0, 'Punching Poro', 'board')
    // un Gold pronto paga [A]
    drive(playToken(g, 0, GOLD, 'base0', { exhausted: false }))
    expect(canPay(g, 0, { energy: 0, power: [['Order']] })).toBe(true)
    runes(g, 0, 'Fury', 'Fury')
    add(g, 0, 'Vault Breaker')
    act(g, 0, 'Vault Breaker', [pick('Punching Poro')])
    expect([...g.objs.values()].some((o) => o.zone === 'board' && o.card.name === 'Gold')).toBe(false)
    expect(logText(g)).toMatch(/uccide un Gold/)
  })

  card('Carrion Dredger', () => {
    const g = scene()
    const d = add(g, 0, 'Carrion Dredger', 'board', 'bf1')
    drive(
      (function* () {
        yield* kill(g, [d], 'test')
        yield* settle(g)
      })(),
    )
    const bird = named(g, 'Bird')[0]
    expect(bird.loc).toBe('base0')
    expect(might(g, bird)).toBe(1)
  })

  card('Bird', () => {
    const g = scene()
    const b = spawn(g, BIRD, 0, 'board', 'base0')
    expect(kw(g, b).deflect).toBe(1)
  })

  card('Rengar, Unseen', () => {
    const g = scene()
    const r = add(g, 0, 'Rengar, Unseen', 'board', 'bf0')
    expect(kw(g, r)).toMatchObject({ assault: 2, deflect: 1, ganking: true })
    expect(standardDests(g, r)).toContain('bf1')
  })

  card('Serrated Dirk', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury')
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Serrated Dirk')
    act(g, 0, 'Gioca Serrated Dirk')
    act(g, 0, 'Serrated Dirk: Equip', [pick('Punching Poro')])
    expect(might(g, u)).toBe(2) // bonus 0
    expect([...g.objs.values()].find((o) => o.card.name === 'Serrated Dirk' && o.zone === 'board')!.attachedTo).toBe(u.uid)
  })

  card('Tactical Retreat', () => {
    const g = scene()
    runes(g, 0, 'Order', 'Order')
    const u = add(g, 0, 'Punching Poro', 'board', 'bf1')
    u.damage = 1
    add(g, 0, 'Tactical Retreat')
    act(g, 0, 'Tactical Retreat', [pick('Punching Poro')])
    drive(kill(g, [u], 'test'))
    expect(g.objs.has(u.uid)).toBe(true)
    expect(u).toMatchObject({ loc: 'base0', exhausted: true, damage: 0 })
    drive(kill(g, [u], 'test')) // solo la prossima volta
    expect(g.objs.has(u.uid)).toBe(false)
  })

  card('Divining Shells', () => {
    const g = scene()
    runes(g, 0, 'Order', 'Order')
    top(g, 0, 'Charm')
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Divining Shells')
    act(g, 0, 'Gioca Divining Shells', [pick('Charm')])
    expect(g.objs.get(g.players[0].deck[g.players[0].deck.length - 1])!.card.name).toBe('Charm') // riciclata con Predict
    act(g, 0, 'Uccidi ed esaurisci', [pick('Punching Poro')])
    expect(might(g, u)).toBe(4)
    expect(names(g, g.players[0].trash)).toContain('Divining Shells')
  })

  card('Mageseeker Investigator', () => {
    const g = scene()
    g.bfs[1].controller = 1
    add(g, 1, 'Mageseeker Investigator', 'board', 'bf1')
    add(g, 0, 'Shadow Assassin', 'board')
    add(g, 0, 'Punching Poro', 'board')
    act(g, 0, 'Muovi', [pick('Shadow Assassin', 'Punching Poro'), pick('Grove')], passAll)
    expect(logText(g)).toMatch(/servono 1 Power in più/)
    expect(named(g, 'Shadow Assassin')[0].loc).toBe('base0')
    runes(g, 0, 'Fury')
    act(g, 0, 'Muovi', [pick('Shadow Assassin', 'Punching Poro'), pick('Grove')], passAll)
    expect(g.players[0].runes.length).toBe(0) // pagata la Power
  })

  card('Xerath, Freed', () => {
    const g = scene()
    runes(g, 0, 'Fury')
    const x = add(g, 0, 'Xerath, Freed', 'board')
    const t = add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    expect(can(g, 'Xerath, Freed: Esaurisci')).toBe(false) // solo in un campo
    x.loc = 'bf0'
    act(g, 0, 'Xerath, Freed: Esaurisci', [pick('Pakaa Protector')])
    expect(t.damage).toBe(3)
    expect(x.exhausted).toBe(true)
  })

  card('Upstage Comedy', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Fury')
    const a = add(g, 0, 'Punching Poro', 'board')
    const b = add(g, 0, 'Shadow Fiend', 'board')
    a.exhausted = b.exhausted = true
    add(g, 0, 'Upstage Comedy')
    act(g, 0, 'Upstage Comedy', [yes, pick('Punching Poro'), pick('Shadow Fiend')])
    expect([a.exhausted, b.exhausted]).toEqual([false, false])
  })

  card('Soul Harvest', () => {
    const g = scene()
    runes(g, 0, 'Order', 'Order')
    add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    const s = add(g, 1, 'Soulspinner', 'board', 'bf1')
    add(g, 0, 'Soul Harvest')
    let opts: string[] = []
    act(g, 0, 'Soul Harvest', [(d) => {
      if (d.type === 'choose') opts = d.options.map((o) => o.label)
      return pick('Soulspinner')(d)
    }])
    expect(opts).not.toContain('Pakaa Protector')
    expect(g.objs.has(s.uid)).toBe(false)
  })

  card('Trapping Grounds', () => {
    const g = scene()
    setBf(g, 1, 'Trapping Grounds')
    g.bfs[1].controller = 1
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    add(g, 0, 'Shadow Assassin', 'board')
    add(g, 0, 'Punching Poro', 'board')
    act(g, 0, 'Muovi', [pick('Shadow Assassin', 'Punching Poro'), pick('Trapping')], passAll)
    expect(named(g, 'Bird').length).toBe(1)
    // senza eccesso niente Bird
    const h = scene()
    setBf(h, 1, 'Trapping Grounds')
    h.bfs[1].controller = 1
    add(h, 1, 'Soulspinner', 'board', 'bf1')
    add(h, 0, 'Shadow Order Disciple', 'board') // 2 contro 3: perde
    add(h, 0, 'Punching Poro', 'board') // 4 in tutto: eccesso 1
    act(h, 0, 'Muovi', [pick('Shadow Order Disciple', 'Punching Poro'), pick('Trapping'), no], passAll)
    expect(named(h, 'Bird').length).toBe(0)
  })

  card('Star Spring', () => {
    const g = scene()
    setBf(g, 0, 'Star Spring')
    g.bfs[0].controller = 0
    const other = add(g, 0, 'Punching Poro', 'board', 'bf0')
    runes(g, 0, 'Fury', 'Fury')
    add(g, 0, 'Shadow Fiend')
    act(g, 0, 'Gioca Shadow Fiend', [pick('Star Spring'), pick('Punching Poro')])
    expect(other.loc).toBe('base0')
    expect(named(g, 'Shadow Fiend')[0].loc).toBe('bf0')
  })

  card('Valley of Idols', () => {
    const g = scene()
    setBf(g, 0, 'Valley of Idols')
    g.bfs[0].controller = 0
    add(g, 0, 'Punching Poro', 'board', 'bf0')
    runes(g, 0, 'Fury', 'Fury', 'Fury')
    add(g, 0, 'Shadow Fiend')
    act(g, 0, 'Gioca Shadow Fiend', [pick('Valley'), yes])
    const f = named(g, 'Shadow Fiend')[0]
    expect(f.buff).toBe(true)
    expect(might(g, f)).toBe(3)
  })
})
