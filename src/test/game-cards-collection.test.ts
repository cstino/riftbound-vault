// Carte della collezione (blocco 1): ogni test verifica il testo stampato della carta.
import { describe, expect, it } from 'vitest'
import { available, kw, might, units, scoreBf, settle, totalCost } from '../lib/game/engine'
import { validateDeck } from '../lib/deck'
import type { Decision, Game } from '../lib/game/types'
import { act, add, drive, logText, no, pick, runes, scene, top, yes } from './gameScene'
import { byName, db } from './gameHelpers'

function card(name: string, fn: () => void) {
  it(name, fn)
}

const named = (g: Game, name: string) => units(g).filter((u) => u.card.name === name)
const passAll = (d: Decision) => (d.type === 'act' ? 'pass' : undefined)
const can = (g: Game, p: 0 | 1, label: string) => available(g, p).some((a) => a.label.includes(label))
const inHand = (g: Game, p: 0 | 1) => g.players[p].hand.map((u) => g.objs.get(u)!.card.name)
const inTrash = (g: Game, p: 0 | 1) => g.players[p].trash.map((u) => g.objs.get(u)!.card.name)
/** Zona attuale di un oggetto: cambiando zona il motore crea un oggetto nuovo (moveZone), quindi si cerca per uid. */
const zoneOf = (g: Game, o: { uid: number }) => (g.objs.get(o.uid)?.zone === 'board' ? 'board' : 'altrove')
const R = (d: 'Fury' | 'Calm' | 'Mind' | 'Body' | 'Chaos' | 'Order', n: number) => Array(n).fill(d) as (typeof d)[]
const cost = (g: Game, p: 0 | 1, name: string) => totalCost(g, p, add(g, p, name), 'hand', { paid: false, extraPower: 0 })
const run = (g: Game, gen: Generator<Decision, unknown, unknown>, script: Parameters<typeof drive>[1] = []) =>
  drive(
    (function* () {
      yield* gen as never
      yield* settle(g)
    })(),
    script,
    passAll,
  )

describe('carte della collezione: Fury', () => {
  card('Bilgewater Tracker', () => {
    const g = scene()
    const a = add(g, 1, 'Mournful Witness', 'board')
    const b = add(g, 1, 'Loyal Poro', 'board')
    const c = add(g, 1, 'Punching Poro', 'board')
    runes(g, 0, ...R('Fury', 3))
    add(g, 0, 'Bilgewater Tracker')
    act(g, 0, 'Gioca Bilgewater Tracker', [pick('Mournful Witness', 'Loyal Poro')], passAll)
    expect([a.damage, b.damage, c.damage]).toEqual([1, 1, 0]) // al massimo 2 unità, 1 danno ciascuna
  })

  card('Brawl', () => {
    const g = scene()
    const u = add(g, 0, 'Loyal Poro', 'board', 'bf0')
    runes(g, 0, ...R('Fury', 4))
    add(g, 0, 'Brawl')
    act(g, 0, 'Gioca Brawl', [pick('Loyal Poro')], passAll)
    expect(kw(g, u).assault).toBe(3) // Assault pari alla Might (3)
    u.role = 'attacker'
    expect(might(g, u)).toBe(6)
  })

  card('Rally for War', () => {
    const g = scene()
    expect(can(g, 0, 'Gioca Rally for War')).toBe(false)
    add(g, 0, 'Rally for War')
    expect(can(g, 0, 'Gioca Rally for War')).toBe(false) // nessun campo nemico occupato
    g.bfs[1].controller = 1
    add(g, 1, 'Loyal Poro', 'board', 'bf1')
    runes(g, 0, ...R('Fury', 4))
    act(g, 0, 'Gioca Rally for War', [], passAll)
    expect(logText(g).match(/gioca un token Recruit/g)?.length).toBe(3)
  })

  card('Lost to the Sands', () => {
    const g = scene()
    const u = add(g, 1, 'Loyal Poro', 'board', 'bf1')
    runes(g, 0, ...R('Fury', 4))
    add(g, 0, 'Lost to the Sands')
    act(g, 0, 'Gioca Lost to the Sands', [pick('Infliggi 4'), pick('Loyal Poro')], passAll)
    expect(zoneOf(g, u)).toBe('altrove')
    // seconda modalità: uccide un equipaggiamento
    const h = scene()
    const gear = add(h, 1, 'Jagged Cutlass', 'board')
    runes(h, 0, ...R('Fury', 4))
    add(h, 0, 'Lost to the Sands')
    act(h, 0, 'Gioca Lost to the Sands', [pick('Uccidi un equipaggiamento'), pick('Jagged Cutlass')], passAll)
    expect(zoneOf(h, gear)).toBe('altrove')
  })

  card('Black Rose Dignitary', () => {
    const g = scene()
    const d = add(g, 0, 'Black Rose Dignitary', 'board')
    expect(kw(g, d).assault).toBe(1)
    const before = g.players[0].runes.length
    d.damage = 5
    run(g, settle(g))
    expect(g.players[0].runes.length).toBe(before + 1)
    expect(g.objs.get(g.players[0].runes[g.players[0].runes.length - 1])!.exhausted).toBe(true) // canalizzata esausta
  })

  card('Brittle Steel', () => {
    const g = scene()
    const gear = add(g, 1, 'Jagged Cutlass', 'board')
    runes(g, 0, ...R('Fury', 3))
    add(g, 0, 'Brittle Steel')
    act(g, 0, 'Gioca Brittle Steel', [pick('Jagged Cutlass')], passAll)
    expect(zoneOf(g, gear)).toBe('altrove')
    // Flow [4][Fury] dal trash, poi esiliata
    add(g, 1, 'Nazuman Ntofo', 'board')
    runes(g, 0, ...R('Fury', 5))
    act(g, 0, 'Gioca Brittle Steel dal trash', [pick('Nazuman Ntofo')], passAll)
    expect(g.players[0].banish.map((u) => g.objs.get(u)!.card.name)).toEqual(['Brittle Steel'])
  })

  card('Eclipse Dragon', () => {
    const g = scene()
    const d = add(g, 0, 'Eclipse Dragon', 'board')
    d.exhausted = false
    top(g, 0, 'Charm')
    runes(g, 0, ...R('Fury', 4))
    act(g, 0, 'Muovi', [pick('Eclipse Dragon'), pick(g.bfs[1].card.name)], passAll)
    expect(inHand(g, 0)).toContain('Charm') // 4 rune o meno: pesca 1
    // con 5 rune non pesca
    const h = scene()
    const d2 = add(h, 0, 'Eclipse Dragon', 'board')
    d2.exhausted = false
    top(h, 0, 'Charm')
    runes(h, 0, ...R('Fury', 5))
    act(h, 0, 'Muovi', [pick('Eclipse Dragon'), pick(h.bfs[1].card.name)], passAll)
    expect(inHand(h, 0)).not.toContain('Charm')
  })

  card('Decree of Rage', () => {
    const g = scene()
    const calm = add(g, 1, 'Mournful Witness', 'board')
    add(g, 1, 'Loyal Poro', 'board') // Order: non è un bersaglio valido
    runes(g, 0, ...R('Fury', 2))
    add(g, 0, 'Decree of Rage')
    const { seen } = act(g, 0, 'Gioca Decree of Rage', [pick('Mournful Witness')], passAll)
    const target = seen.find((d) => d.type === 'choose' && d.title.startsWith('Decree'))
    expect(target?.type === 'choose' && target.options.map((o) => o.label)).toEqual(['Mournful Witness'])
    expect(zoneOf(g, calm)).toBe('altrove')
  })

  card('Consuming Curse', () => {
    const g = scene()
    const u = add(g, 1, 'Loyal Poro', 'board', 'bf1')
    add(g, 0, 'Consuming Curse', 'trash')
    runes(g, 0, ...R('Fury', 2))
    add(g, 0, 'Consuming Curse')
    act(g, 0, 'Gioca Consuming Curse', [pick('Loyal Poro')], passAll)
    expect(zoneOf(g, u)).toBe('altrove') // 2 + 1 danno bonus (una copia nel trash) = 3, letale
  })
})

describe('carte della collezione: Calm', () => {
  card('Disarming Rake', () => {
    const g = scene()
    const gear = add(g, 1, 'Jagged Cutlass', 'board')
    runes(g, 0, ...R('Calm', 3))
    add(g, 0, 'Disarming Rake')
    act(g, 0, 'Gioca Disarming Rake', [pick('Jagged Cutlass')], passAll)
    expect(zoneOf(g, gear)).toBe('altrove')
  })

  card('Ribbon Dancer', () => {
    const g = scene()
    const d = add(g, 0, 'Ribbon Dancer', 'board')
    const f = add(g, 0, 'Loyal Poro', 'board')
    d.exhausted = false
    act(g, 0, 'Muovi', [pick('Ribbon Dancer'), pick(g.bfs[0].card.name), pick('Loyal Poro')], passAll)
    expect(might(g, f)).toBe(4)
  })

  card('Iridescent Avian', () => {
    const g = scene()
    const a = add(g, 0, 'Iridescent Avian', 'board')
    a.exhausted = false
    const u = add(g, 0, 'Loyal Poro', 'board')
    act(g, 0, 'Iridescent Avian: Esaurisci', [pick('Loyal Poro')], passAll)
    expect(u.buff).toBe(true)
    expect(a.exhausted).toBe(true)
    a.exhausted = false
    act(g, 0, 'Iridescent Avian: Esaurisci', [pick('Loyal Poro')], passAll)
    expect(might(g, u)).toBe(3 + 1 + 2) // già con buff: +2 in questo turno
  })

  card('Tomb-Raider Barbara', () => {
    const g = scene()
    const gear = add(g, 1, 'Jagged Cutlass', 'board')
    gear.empowered = true
    runes(g, 0, ...R('Calm', 7))
    add(g, 0, 'Tomb-Raider Barbara')
    act(g, 0, 'Gioca Tomb-Raider Barbara', [pick('Jagged Cutlass')], passAll)
    expect(gear.empowered).toBe(false) // era Empowered: solo disempower
    expect(zoneOf(g, gear)).toBe('board')
    // con meno di 7 rune non fa nulla
    const h = scene()
    const g2 = add(h, 1, 'Jagged Cutlass', 'board')
    runes(h, 0, ...R('Calm', 4))
    add(h, 0, 'Tomb-Raider Barbara')
    act(h, 0, 'Gioca Tomb-Raider Barbara', [], passAll)
    expect(zoneOf(h, g2)).toBe('board')
  })

  card('Horns of the Dragon', () => {
    const g = scene()
    expect(kw(g, add(g, 0, 'Horns of the Dragon', 'board')).tank).toBe(true)
  })
})

describe('carte della collezione: Order', () => {
  card('Masa, Crashing Thunder', () => {
    const g = scene()
    const e = add(g, 1, 'Loyal Poro', 'board', 'bf1')
    runes(g, 0, ...R('Order', 5))
    add(g, 0, 'Masa, Crashing Thunder')
    act(g, 0, 'Gioca Masa', [yes, pick('Loyal Poro')], passAll)
    expect(e.stunned).toBe(true)
    // senza il costo aggiuntivo niente stordimento
    const h = scene()
    const e2 = add(h, 1, 'Loyal Poro', 'board', 'bf1')
    runes(h, 0, ...R('Order', 5))
    add(h, 0, 'Masa, Crashing Thunder')
    act(h, 0, 'Gioca Masa', [no], passAll)
    expect(e2.stunned).toBe(false)
  })

  card('Reluctant Leader', () => {
    const g = scene()
    const l = add(g, 0, 'Reluctant Leader', 'board')
    runes(g, 0, ...R('Fury', 2))
    add(g, 0, 'Punching Poro')
    act(g, 0, 'Gioca Punching Poro', [], passAll)
    expect(might(g, l)).toBe(5)
  })

  card('One-Two Punch', () => {
    const g = scene()
    const f = add(g, 0, 'Loyal Poro', 'board')
    const e = add(g, 1, 'Mournful Witness', 'board')
    runes(g, 0, ...R('Order', 3))
    add(g, 0, 'One-Two Punch')
    act(g, 0, 'Gioca One-Two Punch', [pick('Loyal Poro'), pick('Mournful Witness')], passAll)
    expect(f.buff).toBe(true)
    expect(e.stunned).toBe(true)
  })

  card('Mournful Spirit', () => {
    const g = scene()
    g.bfs[0].controller = 0
    const s = add(g, 0, 'Mournful Spirit', 'board', 'bf0')
    const gear = add(g, 1, 'Bushwhack Trap', 'board', 'bf0') // con Deploy: resta nel campo (830)
    s.damage = 5
    run(g, settle(g), [pick('Bushwhack Trap')])
    expect(zoneOf(g, gear)).toBe('altrove')
  })

  card('Solari Sunhawk', () => {
    const g = scene()
    const s = add(g, 0, 'Solari Sunhawk', 'board')
    expect(kw(g, s).deflect).toBe(0)
    s.empowered = true
    expect(kw(g, s).deflect).toBe(2)
    expect(might(g, s)).toBe(4)
  })
})

describe('carte della collezione: Mind', () => {
  card('Mysterious Chronomancer', () => {
    const g = scene()
    top(g, 0, 'Charm', 'Death Mark')
    runes(g, 0, ...R('Mind', 5))
    add(g, 0, 'Mysterious Chronomancer')
    const { seen } = act(g, 0, 'Gioca Mysterious Chronomancer', [], passAll)
    expect(seen.some((d) => d.type === 'choose' && d.title.startsWith('Predict 2'))).toBe(true)
    expect(kw(g, named(g, 'Mysterious Chronomancer')[0]).disarm).toBe(2)
  })

  card('Trinket Peddler', () => {
    const g = scene()
    expect(kw(g, add(g, 0, 'Trinket Peddler', 'board')).disarm).toBe(1)
  })

  card('Aspiring Engineer', () => {
    const g = scene()
    add(g, 0, 'Jagged Cutlass', 'trash')
    runes(g, 0, ...R('Mind', 4))
    add(g, 0, 'Aspiring Engineer')
    act(g, 0, 'Gioca Aspiring Engineer', [], passAll)
    expect(inHand(g, 0)).toContain('Jagged Cutlass')
  })

  card('Cloud Drake', () => {
    const g = scene()
    top(g, 0, 'Charm')
    runes(g, 0, ...R('Mind', 6))
    add(g, 0, 'Cloud Drake')
    act(g, 0, 'Gioca Cloud Drake', [], passAll)
    expect(inHand(g, 0)).toEqual(['Charm'])
  })

  card('Dredge Up', () => {
    const g = scene()
    top(g, 0, 'Charm', 'Death Mark')
    runes(g, 0, ...R('Mind', 2))
    add(g, 0, 'Dredge Up')
    act(g, 0, 'Gioca Dredge Up', [], passAll)
    expect(inHand(g, 0)).toEqual(['Death Mark'])
    runes(g, 0, ...R('Mind', 2))
    act(g, 0, 'Gioca Dredge Up dal trash', [], passAll) // Flow [2]
    expect(inHand(g, 0)).toEqual(['Death Mark', 'Charm'])
  })

  card('Mesmerize', () => {
    const g = scene()
    const f = add(g, 0, 'Loyal Poro', 'board')
    const e = add(g, 1, 'Mournful Witness', 'board')
    runes(g, 0, ...R('Mind', 2))
    add(g, 0, 'Mesmerize')
    act(g, 0, 'Gioca Mesmerize', [pick('-2 Might'), pick('Mournful Witness')], passAll)
    expect(might(g, e)).toBe(0)
    runes(g, 0, ...R('Mind', 2))
    add(g, 0, 'Mesmerize')
    act(g, 0, 'Gioca Mesmerize', [pick('Rimanda in mano'), pick('Loyal Poro')], passAll)
    expect(inHand(g, 0)).toContain('Loyal Poro')
  })

  card('Shock Blast', () => {
    const g = scene()
    expect(cost(g, 0, 'Shock Blast').energy).toBe(3)
    add(g, 0, 'Punching Poro', 'board').empowered = true
    expect(cost(g, 0, 'Shock Blast').energy).toBe(1) // controlli qualcosa di Empowered: 2 in meno
  })

  card('Apprentice Mage', () => {
    const g = scene()
    const m = add(g, 0, 'Apprentice Mage', 'board')
    top(g, 0, 'Charm', 'Death Mark')
    runes(g, 0, ...R('Mind', 2))
    const { seen } = act(g, 0, 'Empower', [], passAll)
    expect(m.empowered).toBe(true)
    expect(might(g, m)).toBe(4)
    expect(seen.some((d) => d.type === 'choose' && d.title.startsWith('Predict 2'))).toBe(true)
  })

  card('Sky Cruiser', () => {
    const g = scene()
    const s = add(g, 0, 'Sky Cruiser', 'board')
    s.exhausted = false
    const t = add(g, 1, 'Loyal Poro', 'board', 'bf1')
    expect(can(g, 0, 'Sky Cruiser: Scarta')).toBe(false) // nessun equipaggiamento in mano
    add(g, 0, 'Jagged Cutlass')
    runes(g, 0, ...R('Mind', 1))
    act(g, 0, 'Sky Cruiser: Scarta', [pick('Loyal Poro'), pick('Jagged Cutlass')], passAll)
    expect(zoneOf(g, t)).toBe('altrove')
    expect(inTrash(g, 0)).toContain('Jagged Cutlass')
    expect(s.exhausted).toBe(true)
  })

  card('Fate Weaver', () => {
    const g = scene()
    top(g, 0, 'Charm', 'Supernova', 'Death Mark')
    runes(g, 0, ...R('Mind', 5))
    add(g, 0, 'Fate Weaver')
    act(g, 0, 'Gioca Fate Weaver', [pick('Supernova')], passAll)
    expect(inHand(g, 0)).toEqual(['Supernova']) // magia da 4 o più
    const deck = g.players[0].deck.map((u) => g.objs.get(u)!.card.name)
    expect(deck.slice(-3)).toEqual(expect.arrayContaining(['Charm', 'Death Mark'])) // le altre 3 in fondo
  })
})

describe('carte della collezione: Body', () => {
  card('Nazuman Ntofo', () => {
    const g = scene()
    add(g, 0, 'Nazuman Ntofo', 'board')
    const u = add(g, 0, 'Loyal Poro', 'board')
    runes(g, 0, ...R('Body', 1))
    act(g, 0, 'Equip', [pick('Loyal Poro')], passAll)
    expect(logText(g)).toMatch(/Nazuman Ntofo si attacca a Loyal Poro/)
    expect(might(g, u)).toBe(3) // 0 Might
  })

  card('Jagged Cutlass', () => {
    const g = scene()
    add(g, 0, 'Jagged Cutlass', 'board')
    const u = add(g, 0, 'Loyal Poro', 'board')
    runes(g, 0, 'Body')
    act(g, 0, 'Equip', [pick('Loyal Poro')], passAll)
    expect(might(g, u)).toBe(5)
  })

  card('Overloaded Traveler', () => {
    const g = scene()
    g.bfs[0].controller = 0
    const t = add(g, 0, 'Overloaded Traveler', 'board', 'bf0')
    expect(might(g, t)).toBe(2)
    add(g, 0, 'Bushwhack Trap', 'board', 'bf0') // equipaggiamento con Deploy nel mio campo
    expect(might(g, t)).toBe(3)
  })

  card('Stalwart Goatherd', () => {
    const g = scene()
    const cheap = add(g, 1, 'Jagged Cutlass', 'board')
    runes(g, 0, ...R('Body', 4))
    add(g, 0, 'Stalwart Goatherd')
    act(g, 0, 'Gioca Stalwart Goatherd', [pick('Jagged Cutlass')], passAll)
    expect(zoneOf(g, cheap)).toBe('altrove')
    expect(kw(g, named(g, 'Stalwart Goatherd')[0]).shield).toBe(2)
  })

  card('Avalanche', () => {
    const g = scene()
    const a = add(g, 0, 'Loyal Poro', 'board')
    const b = add(g, 1, 'Mournful Witness', 'board')
    const c = add(g, 1, 'Punching Poro', 'board', 'bf1')
    runes(g, 0, 'Body', 'Body', 'Body', 'Body', 'Body', 'Body', 'Body')
    add(g, 0, 'Avalanche')
    act(g, 0, 'Gioca Avalanche', [], passAll)
    expect([zoneOf(g, a), zoneOf(g, b), c.damage]).toEqual(['altrove', 'altrove', 0]) // solo le unità nelle basi
  })

  card('Primordial Roar', () => {
    const g = scene()
    add(g, 0, 'Horns of the Dragon', 'board') // 6 Might
    const t = add(g, 1, 'Mournful Witness', 'board')
    runes(g, 0, ...R('Body', 6))
    add(g, 0, 'Primordial Roar')
    act(g, 0, 'Gioca Primordial Roar', [pick('Horns of the Dragon'), pick('Mournful Witness')], passAll)
    expect(zoneOf(g, t)).toBe('altrove')
  })

  card('Guttural Roar', () => {
    const g = scene()
    const u = add(g, 0, 'Loyal Poro', 'board')
    u.empowered = true
    runes(g, 0, ...R('Body', 2))
    add(g, 0, 'Guttural Roar')
    act(g, 0, 'Gioca Guttural Roar', [pick('Loyal Poro')], passAll)
    expect(might(g, u)).toBe(7) // Empowered: +4
  })

  card('Brutal Hunter', () => {
    const g = scene()
    const h = add(g, 0, 'Brutal Hunter', 'board')
    expect([might(g, h), kw(g, h).ganking]).toEqual([4, false])
    h.empowered = true
    expect([might(g, h), kw(g, h).ganking]).toEqual([6, true])
  })

  card('Repair Specialist', () => {
    const g = scene()
    const r = add(g, 0, 'Repair Specialist', 'board')
    add(g, 0, 'Jagged Cutlass', 'board')
    add(g, 0, 'Nazuman Ntofo', 'board')
    add(g, 1, 'Jagged Cutlass', 'board') // non è mio
    expect(kw(g, r).assault).toBe(2)
  })
})

describe('carte della collezione: Chaos', () => {
  card('Disposal Expert', () => {
    const g = scene()
    runes(g, 0, ...R('Chaos', 4))
    add(g, 0, 'Disposal Expert')
    act(g, 0, 'Gioca Disposal Expert', [], passAll)
    const d = named(g, 'Disposal Expert')[0]
    expect(d.exhausted).toBe(false) // nessun'altra unità: entra pronta
    expect(kw(g, d).disarm).toBe(2)
    const h = scene()
    add(h, 0, 'Loyal Poro', 'board')
    runes(h, 0, ...R('Chaos', 4))
    add(h, 0, 'Disposal Expert')
    act(h, 0, 'Gioca Disposal Expert', [], passAll)
    expect(named(h, 'Disposal Expert')[0].exhausted).toBe(true)
  })

  card('Spiderling', () => {
    const g = scene()
    g.bfs[0].controller = 0
    const s = add(g, 0, 'Spiderling', 'board', 'bf0')
    add(g, 0, 'Spiderling', 'board', 'bf0')
    add(g, 0, 'Spiderling', 'board', 'base0') // non è qui
    expect(might(g, s)).toBe(2)
    // il mazzo può avere un numero qualsiasi di Spiderling (002: il testo della carta vince sulla regola 103.3.b)
    const sp = byName('Spiderling')
    const issues = validateDeck({ id: 'x', name: 'x', legendId: null, championId: null, main: { [sp.id]: 6 }, runes: {}, battlefields: [], updatedAt: 0 }, db)
    expect(issues.some((i) => i.rule === '103.3.b')).toBe(false)
  })
})

describe('carte della collezione: campi di battaglia', () => {
  card('Packed Amphitheater', () => {
    const g = scene()
    g.bfs[0].card = byName('Packed Amphitheater')
    g.bfs[0].controller = 0
    const champ = add(g, 0, 'Shen, Kinkou', 'board', 'bf0')
    const plain = add(g, 0, 'Loyal Poro', 'board', 'bf0')
    expect(might(g, champ)).toBe((byName('Shen, Kinkou').might ?? 0) + 1)
    expect(might(g, plain)).toBe(3)
  })

  card('Cosmic Vista', () => {
    const g = scene()
    g.bfs[0].card = byName('Cosmic Vista')
    g.bfs[0].controller = 0
    add(g, 0, 'Loyal Poro', 'board', 'bf0')
    const before = g.players[0].points
    run(g, scoreBf(g, 0, 'bf0', 'hold'))
    expect(g.players[0].points).toBe(before + 1) // Rune Deck pieno: solo il punto del hold
    g.players[0].scored = []
    g.players[0].runeDeck = []
    run(g, scoreBf(g, 0, 'bf0', 'hold'))
    expect(g.players[0].points).toBe(before + 3) // hold + 1 punto di Cosmic Vista
  })
})
