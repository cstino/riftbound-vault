// Carte del mazzo Fiora: ogni test verifica il testo stampato della carta.
import { describe, expect, it } from 'vitest'
import { kill, kw, might, playToken, scoreBf, settle, totalCost, units } from '../lib/game/engine'
import { SAND_SOLDIER } from '../lib/game/cards-fiora'
import type { Decision, Game } from '../lib/game/types'
import { act, add, drive, logText, pick, runes, scene, top, yes } from './gameScene'
import { byName } from './gameHelpers'

function card(name: string, fn: () => void) {
  it(name, fn)
}

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
const B = (n: number) => Array(n).fill('Body') as 'Body'[]

/** Rende Mighty un'unità passando per lo stato "non Mighty" osservato dal motore (709). */
function pump(g: Game, name: string, n: number) {
  run(g, settle(g)) // il motore registra lo stato attuale
  const u = named(g, name)[0]
  u.mods.push({ source: 'test', might: n })
  return u
}

describe('carte del mazzo Fiora', () => {
  card('Fiora - Grand Duelist', () => {
    const g = scene()
    legendIs(g, 0, 'Fiora - Grand Duelist')
    add(g, 0, 'Punching Poro', 'board')
    const before = g.players[0].runes.length
    pump(g, 'Punching Poro', 3)
    run(g, settle(g), [yes])
    expect(logText(g)).toMatch(/Punching Poro diventa Mighty/)
    expect(g.players[0].runes.length).toBe(before + 1)
    expect(g.objs.get(g.players[0].runes.at(-1)!)!.exhausted).toBe(true)
    expect(g.objs.get(g.players[0].legend)!.exhausted).toBe(true)
    // già Mighty: +1 non la fa "diventare" di nuovo
    const n = g.players[0].runes.length
    g.objs.get(g.players[0].legend)!.exhausted = false
    pump(g, 'Punching Poro', 1)
    run(g, settle(g), [yes])
    expect(g.players[0].runes.length).toBe(n)
  })

  card('Fiora, Peerless', () => {
    const g = scene()
    g.bfs[1].controller = 1
    const e = add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    const f = add(g, 0, 'Fiora, Peerless', 'board')
    act(g, 0, 'Muovi', [pick('Fiora, Peerless'), pick('Grove')], passAll)
    expect(logText(g)).toMatch(/raddoppia/)
    expect(g.objs.has(e.uid)).toBe(false) // 6 contro 4
    expect(f.loc).toBe('bf1')
    expect(might(g, f)).toBe(3) // finito il combattimento torna normale
    // non one on one: niente raddoppio
    const h = scene()
    h.bfs[1].controller = 1
    add(h, 1, 'Pakaa Protector', 'board', 'bf1')
    add(h, 0, 'Fiora, Peerless', 'board')
    add(h, 0, 'Sharkling', 'board')
    act(h, 0, 'Muovi', [pick('Fiora, Peerless', 'Sharkling'), pick('Grove')], passAll)
    expect(logText(h)).not.toMatch(/raddoppia/)
  })

  card('Fiora, Worthy', () => {
    const g = scene()
    runes(g, 0, 'Order')
    add(g, 0, 'Fiora, Worthy', 'board')
    const u = add(g, 0, 'Punching Poro', 'board')
    u.exhausted = true
    pump(g, 'Punching Poro', 3)
    run(g, settle(g), [yes])
    expect(u.exhausted).toBe(false)
    expect(g.players[0].runes.length).toBe(0)
  })

  card('Lucian, Merciless', () => {
    const g = scene()
    runes(g, 0, ...O(4))
    const sword = add(g, 0, 'B.F. Sword', 'board', 'base0')
    add(g, 0, 'Lucian, Merciless')
    act(g, 0, 'Gioca Lucian, Merciless', [pick('B.F. Sword')])
    const l = named(g, 'Lucian, Merciless')[0]
    expect(sword.attachedTo).toBe(l.uid)
    expect(might(g, l)).toBe(6)
    l.loc = 'bf1'
    l.exhausted = true
    run(g, scoreBf(g, 0, 'bf1', 'conquer'))
    expect(l.exhausted).toBe(false)
    l.exhausted = true
    l.loc = 'bf0'
    run(g, scoreBf(g, 0, 'bf0', 'conquer'))
    expect(l.exhausted).toBe(true) // solo la prima volta nel turno
  })

  card('Yone, Blademaster', () => {
    const g = scene()
    const y = add(g, 0, 'Yone, Blademaster', 'board')
    const t = add(g, 1, 'Pakaa Protector', 'board', 'base1')
    act(g, 0, 'Muovi', [pick('Yone, Blademaster'), pick('Grove')], passAll)
    expect(y.loc).toBe('bf1')
    expect(g.objs.has(t.uid)).toBe(false) // 5 danni a Pakaa Protector (4)
  })

  card('Veteran Poro', () => {
    const g = scene()
    runes(g, 0, ...B(3))
    const sh = add(g, 0, 'Soulspinner', 'board')
    const blade = add(g, 0, "Doran's Blade", 'board', 'base0')
    blade.attachedTo = sh.uid // anche se è già attaccato
    add(g, 0, 'Veteran Poro')
    act(g, 0, 'Gioca Veteran Poro', [pick("Doran's Blade")])
    expect(blade.attachedTo).toBe(named(g, 'Veteran Poro')[0].uid)
    // Equip [Body] non contiene [A]: nessuno sconto (821.1.c.3), si ricicla una runa Body
    expect(g.players[0].runes.length).toBe(2)
    expect(logText(g)).toMatch(/Power Body/)
  })

  card('Jaull-Fish', () => {
    const g = scene()
    const o = add(g, 0, 'Jaull-Fish')
    expect(totalCost(g, 0, o, 'hand', { paid: false, extraPower: 0 }).energy).toBe(7)
    add(g, 0, 'Shadow Assassin', 'board')
    expect(totalCost(g, 0, o, 'hand', { paid: false, extraPower: 0 }).energy).toBe(5)
    expect(kw(g, add(g, 0, 'Jaull-Fish', 'board')).deflect).toBe(0)
  })

  card('Laurent Duelist', () => {
    const g = scene()
    expect(kw(g, add(g, 0, 'Laurent Duelist', 'board')).assault).toBe(2)
  })

  card('Pit Rookie', () => {
    const g = scene()
    runes(g, 0, ...O(2))
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Pit Rookie')
    act(g, 0, 'Gioca Pit Rookie', [pick('Punching Poro')])
    expect(u.buff).toBe(true)
  })

  card('Dauntless Vanguard', () => {
    const g = scene()
    g.bfs[1].controller = 1
    add(g, 1, 'Mournful Witness', 'board', 'bf1')
    runes(g, 0, ...B(5))
    add(g, 0, 'Dauntless Vanguard')
    act(g, 0, 'Gioca Dauntless Vanguard', [pick('Grove')], passAll)
    expect(named(g, 'Dauntless Vanguard')[0].loc).toBe('bf1')
    expect(named(g, 'Mournful Witness').length).toBe(0) // combattimento: 4 contro 2
  })

  card('Unsung Hero', () => {
    const g = scene()
    top(g, 0, 'Charm', 'Charm')
    const u = add(g, 0, 'Unsung Hero', 'board')
    run(g, kill(g, [u], 'test'))
    expect(g.players[0].hand.length).toBe(0)
    const h = scene()
    top(h, 0, 'Charm', 'Charm')
    const w = add(h, 0, 'Unsung Hero', 'board')
    w.mods.push({ source: 'test', might: 3 })
    run(h, kill(h, [w], 'test'))
    expect(h.players[0].hand.length).toBe(2)
  })

  card('Royal Guard', () => {
    const g = scene()
    g.bfs[0].controller = 0
    add(g, 0, 'Punching Poro', 'board', 'bf0')
    runes(g, 0, ...O(4))
    add(g, 0, 'Royal Guard')
    act(g, 0, 'Gioca Royal Guard', [pick('Zaun')])
    const s = named(g, 'Sand Soldier')[0]
    expect(s.loc).toBe('bf0')
    expect(might(g, s)).toBe(2)
  })

  card('Punch First', () => {
    const g = scene()
    runes(g, 0, 'Body', 'Body', 'Body')
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Punch First')
    act(g, 0, 'Gioca Punch First', [pick('Punching Poro')])
    expect(might(g, u)).toBe(7)
  })

  card('Strike Down', () => {
    const g = scene()
    runes(g, 0, ...B(4))
    const u = add(g, 0, 'Soulspinner', 'board', 'bf0')
    const sword = add(g, 0, 'B.F. Sword', 'board', 'bf0')
    sword.attachedTo = u.uid
    const t = add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    add(g, 0, 'Strike Down')
    act(g, 0, 'Gioca Strike Down', [pick('Soulspinner'), pick('Pakaa Protector')])
    expect(g.objs.has(t.uid)).toBe(false) // 6 danni
    expect(sword.attachedTo).toBe(null)
    expect(sword.loc).toBe('base0') // staccato in un campo, viene richiamato nel cleanup (323.6)
  })

  card('Vengeance', () => {
    const g = scene()
    runes(g, 0, ...O(6))
    const t = add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    add(g, 0, 'Vengeance')
    act(g, 0, 'Gioca Vengeance', [pick('Pakaa Protector')])
    expect(g.objs.has(t.uid)).toBe(false)
  })

  card('Riposte', () => {
    const g = scene()
    g.turnPlayer = 1
    runes(g, 1, ...O(6))
    runes(g, 0, ...O(4))
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 1, 'Vengeance')
    add(g, 0, 'Riposte')
    act(g, 1, 'Gioca Vengeance', [pick('Punching Poro'), pick('Riposte'), pick('Punching Poro'), pick('Vengeance')])
    expect(named(g, 'Punching Poro').length).toBe(1)
    expect(might(g, u)).toBe(6) // +4, il costo in energia di Vengeance
    expect(g.players[1].trash.map((x) => g.objs.get(x)!.card.name)).toContain('Vengeance')
  })

  card('Show of Strength', () => {
    const g = scene()
    top(g, 0, 'Charm', 'Charm', 'Charm')
    runes(g, 0, ...B(3))
    add(g, 0, 'Shadow Assassin', 'board')
    add(g, 0, 'Pakaa Protector', 'board').mods.push({ source: 'test', might: 1 })
    add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Show of Strength')
    act(g, 0, 'Gioca Show of Strength')
    expect(g.players[0].hand.length).toBe(2)
  })

  /** Equip [dominio]: si attacca a una tua unità e le dà la Might dell'equipaggiamento (716, 818). */
  function equip(gear: string, dom: 'Order' | 'Body', bonus: number) {
    const g = scene()
    runes(g, 0, dom)
    const x = add(g, 0, gear, 'board', 'base0')
    const u = add(g, 0, 'Punching Poro', 'board')
    act(g, 0, `${gear}: Equip`, [pick('Punching Poro')])
    expect(x.attachedTo).toBe(u.uid)
    expect(might(g, u)).toBe(2 + bonus)
  }
  card('B.F. Sword', () => equip('B.F. Sword', 'Order', 3))
  card('Warmog\'s Armor', () => equip("Warmog's Armor", 'Body', 1))
  card('Sacred Shears', () => equip('Sacred Shears', 'Order', 1))
  card('Doran\'s Blade', () => equip("Doran's Blade", 'Body', 2))

  card('Ornn\'s Forge', () => {
    const g = scene()
    g.bfs[0].card = byName("Ornn's Forge")
    g.bfs[0].controller = 0
    add(g, 0, 'Punching Poro', 'board', 'bf0')
    const a = add(g, 0, 'B.F. Sword')
    expect(totalCost(g, 0, a, 'hand', { paid: false, extraPower: 0 }).energy).toBe(3)
    runes(g, 0, ...O(3))
    act(g, 0, 'Gioca B.F. Sword')
    const b = add(g, 0, 'B.F. Sword')
    expect(totalCost(g, 0, b, 'hand', { paid: false, extraPower: 0 }).energy).toBe(4) // solo il primo del turno
  })

  card('Veiled Temple', () => {
    const g = scene()
    g.bfs[1].card = byName('Veiled Temple')
    const u = add(g, 0, 'Punching Poro', 'board', 'bf1')
    const x = add(g, 0, 'B.F. Sword', 'board', 'bf1')
    x.attachedTo = u.uid
    x.exhausted = true
    run(g, scoreBf(g, 0, 'bf1', 'conquer'), [pick('B.F. Sword'), yes])
    expect(x.exhausted).toBe(false)
    expect(x.attachedTo).toBe(null)
  })

  card('Sunken Temple', () => {
    const g = scene()
    g.bfs[1].card = byName('Sunken Temple')
    top(g, 0, 'Charm')
    runes(g, 0, 'Order')
    add(g, 0, 'Shadow Assassin', 'board', 'bf1')
    run(g, scoreBf(g, 0, 'bf1', 'conquer'), [yes])
    expect(g.players[0].hand.length).toBe(1)
    // senza unità Mighty niente
    const h = scene()
    h.bfs[1].card = byName('Sunken Temple')
    top(h, 0, 'Charm')
    runes(h, 0, 'Order')
    add(h, 0, 'Punching Poro', 'board', 'bf1')
    run(h, scoreBf(h, 0, 'bf1', 'conquer'))
    expect(h.players[0].hand.length).toBe(0)
  })

  card('Sand Soldier', () => {
    const g = scene()
    run(g, playToken(g, 0, SAND_SOLDIER, 'base0'))
    const s = named(g, 'Sand Soldier')[0]
    expect(might(g, s)).toBe(2) // 187.3
    expect(s.card.tags).toEqual(['Shurima'])
    expect(s.token).toBe(true)
  })
})
