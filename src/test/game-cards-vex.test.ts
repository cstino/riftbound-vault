// Carte del mazzo Vex: ogni test verifica il testo stampato della carta.
import { describe, expect, it } from 'vitest'
import { available, kw, might, playToken, returnToHand, scoreBf, settle, takeTurn, totalCost, units } from '../lib/game/engine'
import { SPRITE } from '../lib/game/cards-vex'
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
    passAll,
  )
const can = (g: Game, p: 0 | 1, label: string) => available(g, p).some((a) => a.label.includes(label))
const C = (n: number) => Array(n).fill('Calm') as 'Calm'[]
const X = (n: number) => Array(n).fill('Chaos') as 'Chaos'[]
const cost = (g: Game, p: 0 | 1, name: string) => totalCost(g, p, add(g, p, name), 'hand', { paid: false, extraPower: 0 })

describe('carte del mazzo Vex', () => {
  card('Vex - Gloomist', () => {
    const g = scene()
    legendIs(g, 0, 'Vex - Gloomist')
    top(g, 0, 'Charm')
    g.bfs[0].controller = 0
    add(g, 0, 'Punching Poro', 'board', 'bf0')
    run(g, scoreBf(g, 0, 'bf0', 'hold'), [yes])
    expect(g.players[0].hand.length).toBe(1)
    expect(g.objs.get(g.players[0].legend)!.exhausted).toBe(true)
  })

  card('Vex, Apathetic', () => {
    const g = scene()
    g.turnPlayer = 1
    add(g, 0, 'Vex, Apathetic', 'board', 'bf0')
    expect(kw(g, named(g, 'Vex, Apathetic')[0]).deflect).toBe(1)
    runes(g, 1, 'Calm', 'Calm')
    add(g, 1, 'Mournful Witness')
    act(g, 1, 'Gioca Mournful Witness')
    const w = named(g, 'Mournful Witness')[0]
    expect(w.stunned).toBe(true)
    w.exhausted = false
    expect(can(g, 1, 'Muovi')).toBe(false) // non può muoverla in questo turno
  })

  card('Vex, Cheerless', () => {
    const g = scene()
    const v = add(g, 0, 'Vex, Cheerless', 'board', 'bf1')
    expect(cost(g, 0, 'Vengeance')).toEqual({ energy: 4, power: [['Order'], ['Order']] })
    v.role = 'attacker'
    // le tue magie costano [1][A] in meno (minimo [1]), quelle nemiche [1][A] in più
    expect(cost(g, 0, 'Vengeance').energy).toBe(3)
    expect(cost(g, 0, 'Vengeance').power.length).toBe(1)
    expect(cost(g, 0, 'Charm').energy).toBe(1)
    expect(cost(g, 1, 'Vengeance').energy).toBe(5)
    expect(cost(g, 1, 'Vengeance').power.length).toBe(3)
  })

  card('Vex, Mocking', () => {
    const g = scene()
    const v = add(g, 0, 'Vex, Mocking', 'board')
    expect(kw(g, v).tank).toBe(true)
    expect(kw(g, v).shield).toBe(1)
    add(g, 1, 'Mournful Witness', 'board', 'bf1')
    runes(g, 0, ...C(3))
    add(g, 0, 'Back Off')
    act(g, 0, 'Gioca Back Off', [pick('Mournful Witness'), yes], passAll)
    expect(logText(g)).toMatch(/Vex, Mocking si sposta/)
  })

  card('Mutated Mouser', () => {
    const g = scene()
    const m = add(g, 0, 'Mutated Mouser', 'board')
    expect(kw(g, m).shield).toBe(2)
    expect(kw(g, m).tank).toBe(true)
  })

  card('Monch', () => {
    const g = scene()
    expect(cost(g, 0, 'Monch').energy).toBe(6)
    add(g, 1, 'Mournful Witness', 'board', 'bf1').stunned = true
    expect(cost(g, 0, 'Monch').energy).toBe(4)
    runes(g, 0, ...C(4))
    act(g, 0, 'Gioca Monch')
    expect(named(g, 'Monch')[0].exhausted).toBe(false)
  })

  card('Existential Dread', () => {
    const g = scene()
    const t = add(g, 1, 'Mournful Witness', 'board', 'bf0')
    t.role = 'attacker'
    runes(g, 0, ...X(4))
    add(g, 0, 'Existential Dread')
    act(g, 0, 'Gioca Existential Dread', [yes, pick('Mournful Witness'), pick('Mournful Witness')])
    // Repeat: la prima volta la stordisce, la seconda (già stordita) torna in mano
    expect(g.players[1].hand.map((u) => g.objs.get(u)!.card.name)).toEqual(['Mournful Witness'])
  })

  card('Allay, Eager Admirer', () => {
    const g = scene()
    const a = add(g, 0, 'Allay, Eager Admirer', 'board', 'bf0')
    const u = add(g, 0, 'Punching Poro', 'board', 'bf0')
    const far = add(g, 0, 'Shadow Fiend', 'board')
    expect(kw(g, a).deflect).toBe(1)
    expect(kw(g, u).deflect).toBe(1)
    expect(kw(g, far).deflect).toBe(0)
  })

  card('Back Off', () => {
    const g = scene()
    top(g, 0, 'Charm')
    runes(g, 0, ...C(3))
    const t = add(g, 1, 'Mournful Witness', 'board', 'bf1')
    add(g, 0, 'Back Off')
    act(g, 0, 'Gioca Back Off', [pick('Mournful Witness')])
    expect(t.stunned).toBe(true)
    expect(g.players[0].hand.length).toBe(1) // giocata dalla mano: pesca 1
    // da coperta non pesca
    const h = scene()
    top(h, 0, 'Charm')
    h.bfs[0].controller = 0
    add(h, 0, 'Punching Poro', 'board', 'bf0')
    const e = add(h, 1, 'Mournful Witness', 'board', 'bf0')
    add(h, 0, 'Back Off', 'facedown', 'bf0')
    act(h, 0, 'Gioca Back Off da nascosta', [pick('Mournful Witness')], passAll)
    expect(e.stunned || !h.objs.has(e.uid)).toBe(true)
    expect(h.players[0].hand.length).toBe(0)
  })

  card('Enthusiastic Promoter', () => {
    const g = scene()
    g.bfs[0].controller = 0
    const p = add(g, 0, 'Enthusiastic Promoter', 'board', 'bf0')
    const u = add(g, 0, 'Punching Poro', 'board', 'bf0')
    expect(kw(g, p).backline).toBe(true)
    run(g, scoreBf(g, 0, 'bf0', 'hold'))
    expect(p.buff && u.buff).toBe(true)
  })

  card('Trevor Snoozebottom', () => {
    const g = scene()
    g.bfs[0].controller = 0
    const t = add(g, 0, 'Trevor Snoozebottom', 'board', 'bf0')
    expect(kw(g, t).shield).toBe(1)
    run(g, scoreBf(g, 0, 'bf0', 'hold'))
    const s = named(g, 'Sprite')[0]
    expect(s.loc).toBe('bf0')
    expect(s.exhausted).toBe(false)
    expect(kw(g, s).temporary).toBe(true)
  })

  card('Blast Cone', () => {
    const g = scene()
    runes(g, 0, ...X(5))
    const t = add(g, 1, 'Mournful Witness', 'board', 'bf1')
    add(g, 0, 'Blast Cone')
    act(g, 0, 'Gioca Blast Cone', [pick('Mournful Witness'), pick('Shen'), yes])
    expect(t.loc).toBe('base1')
    expect(t.stunned).toBe(true)
    const cone = [...g.objs.values()].find((o) => o.zone === 'board' && o.card.name === 'Blast Cone')!
    expect(cone.exhausted).toBe(true)
  })

  card('Megatusk', () => {
    const g = scene()
    g.players[0].xp = 3
    const m = add(g, 0, 'Megatusk', 'board', 'bf0')
    const u = add(g, 0, 'Punching Poro', 'board', 'bf0')
    act(g, 0, 'Megatusk: Spendi 3 XP')
    expect(g.players[0].xp).toBe(0)
    expect(kw(g, m).ganking && kw(g, u).ganking).toBe(true)
    expect(can(g, 0, 'Megatusk: Spendi')).toBe(false)
  })

  card('Nami, Headstrong', () => {
    const g = scene()
    runes(g, 0, ...C(4))
    const t = add(g, 1, 'Mournful Witness', 'board', 'bf1')
    add(g, 0, 'Nami, Headstrong')
    act(g, 0, 'Gioca Nami, Headstrong', [yes, pick('Mournful Witness')])
    expect(t.stunned).toBe(true)
    // hold: la prossima unità giocata si prepara e riceve un buff
    const n = named(g, 'Nami, Headstrong')[0]
    n.loc = 'bf0'
    g.bfs[0].controller = 0
    run(g, scoreBf(g, 0, 'bf0', 'hold'))
    runes(g, 0, 'Fury', 'Fury')
    add(g, 0, 'Punching Poro')
    act(g, 0, 'Gioca Punching Poro', [pick('base')])
    const p = named(g, 'Punching Poro')[0]
    expect(p.exhausted).toBe(false)
    expect(p.buff).toBe(true)
  })

  card('Iascylla', () => {
    const g = scene()
    g.bfs[0].controller = 0
    add(g, 0, 'Iascylla', 'board', 'bf0')
    const t = add(g, 1, 'Mournful Witness', 'board', 'base1')
    run(g, scoreBf(g, 0, 'bf0', 'hold'))
    expect(g.players[0].atMain.length).toBe(1)
    top(g, 0, 'Charm', 'Charm', 'Charm')
    g.phase = 'ending'
    drive(takeTurn(g), [pick('Mournful Witness')], (d) => (d.type === 'act' ? (d.actions.some((x) => x.id === 'pass') ? 'pass' : 'end') : undefined))
    expect(t.loc).toBe('bf0')
  })

  card('Shadow', () => {
    const g = scene()
    g.bfs[0].controller = 0
    add(g, 0, 'Punching Poro', 'board', 'bf0')
    runes(g, 0, ...X(5))
    add(g, 0, 'Shadow')
    act(g, 0, 'Gioca Shadow', [pick('Zaun')])
    const s = named(g, 'Shadow')[0]
    expect(s.exhausted).toBe(false) // giocata in un campo: entra pronta
    const t = add(g, 1, 'Mournful Witness', 'board', 'bf0')
    t.role = 'attacker'
    act(g, 0, 'Shadow: 1 energia', [pick('Mournful Witness')], passAll)
    expect(t.stunned || !g.objs.has(t.uid)).toBe(true)
    expect(logText(g)).toMatch(/Mournful Witness è stordita/)
  })

  card('Scryer\'s Bloom', () => {
    const g = scene()
    top(g, 0, 'Charm', 'Charm', 'Charm')
    runes(g, 0, ...X(2))
    add(g, 0, "Scryer's Bloom")
    act(g, 0, "Gioca Scryer's Bloom")
    const b = [...g.objs.values()].find((o) => o.zone === 'board' && o.card.name === "Scryer's Bloom")!
    expect(b.exhausted).toBe(true) // entra esausto
    expect(can(g, 0, "Scryer's Bloom:")).toBe(false)
    b.exhausted = false
    act(g, 0, "Scryer's Bloom: Uccidimi")
    expect(g.objs.has(b.uid)).toBe(false)
    expect(logText(g)).toMatch(/Predict 2/)
    expect(g.players[0].hand.length).toBe(1)
    expect(g.players[0].xp).toBe(1)
  })

  card('Soul Sword', () => {
    const g = scene()
    runes(g, 0, 'Calm')
    const x = add(g, 0, 'Soul Sword', 'board', 'base0')
    const u = add(g, 0, 'Punching Poro', 'board')
    act(g, 0, 'Soul Sword: Equip', [pick('Punching Poro')])
    expect(x.attachedTo).toBe(u.uid)
    expect(might(g, u)).toBe(3)
  })

  card('Mister Root', () => {
    const g = scene()
    add(g, 0, 'Mister Root', 'board')
    act(g, 0, 'Muovi', [pick('Mister Root'), pick('Zaun')], passAll)
    expect(g.players[0].xp).toBe(2)
  })

  card('Skyward Strike', () => {
    const g = scene()
    runes(g, 0, ...C(3))
    const t = add(g, 1, 'Mournful Witness', 'board', 'bf1')
    add(g, 0, 'Skyward Strike')
    act(g, 0, 'Gioca Skyward Strike', [pick('Mournful Witness'), pick('Shen')])
    expect(t.loc).toBe('base1')
    expect(t.stunned).toBe(false)
    const h = scene()
    h.players[0].xp = 6
    runes(h, 0, ...C(3))
    const a = add(h, 1, 'Mournful Witness', 'board', 'bf1')
    const b = add(h, 1, 'Soulspinner', 'board', 'bf1')
    add(h, 0, 'Skyward Strike')
    act(h, 0, 'Gioca Skyward Strike', [pick('Mournful Witness'), pick('Shen'), pick('Soulspinner')])
    expect(a.loc).toBe('base1')
    expect(b.stunned).toBe(true) // [Level 6]
  })

  card('Combat Experience', () => {
    const g = scene()
    runes(g, 0, ...C(2))
    const u = add(g, 0, 'Punching Poro', 'board')
    add(g, 0, 'Combat Experience')
    act(g, 0, 'Gioca Combat Experience', [pick('Punching Poro')])
    expect(might(g, u)).toBe(3)
    g.players[0].xp = 6
    add(g, 0, 'Combat Experience')
    act(g, 0, 'Gioca Combat Experience', [pick('Punching Poro')])
    expect(might(g, u)).toBe(6)
  })

  card('Herald of Spring', () => {
    const g = scene()
    runes(g, 0, ...C(5))
    add(g, 0, 'Herald of Spring')
    act(g, 0, 'Gioca Herald of Spring')
    expect(g.players[0].xp).toBe(2)
    const h = named(g, 'Herald of Spring')[0]
    expect(kw(g, h).hunt).toBe(1)
    h.loc = 'bf1'
    run(g, scoreBf(g, 0, 'bf1', 'conquer'))
    expect(g.players[0].xp).toBe(3) // Hunt: conquista
  })

  card('Wuju Apprentice', () => {
    const g = scene()
    top(g, 0, 'Charm', 'Charm')
    runes(g, 0, ...C(4))
    add(g, 0, 'Wuju Apprentice')
    act(g, 0, 'Gioca Wuju Apprentice')
    expect(g.players[0].hand.length).toBe(0)
    g.players[0].xp = 6
    add(g, 0, 'Wuju Apprentice')
    act(g, 0, 'Gioca Wuju Apprentice')
    expect(g.players[0].hand.length).toBe(1) // [Level 6]
    g.bfs[0].controller = 0
    named(g, 'Wuju Apprentice')[0].loc = 'bf0'
    run(g, scoreBf(g, 0, 'bf0', 'hold'))
    expect(g.players[0].xp).toBe(7) // Hunt: tiene
  })

  card('Mosstomper', () => {
    const g = scene()
    const m = add(g, 0, 'Mosstomper', 'board')
    expect(kw(g, m).hunt).toBe(2)
    expect(might(g, m)).toBe(3)
    expect(kw(g, m).deflect).toBe(0)
    g.players[0].xp = 3
    expect(might(g, m)).toBe(4)
    expect(kw(g, m).deflect).toBe(1)
  })

  card('Amateur Recital', () => {
    const g = scene()
    g.bfs[0].card = byName('Amateur Recital')
    g.bfs[0].controller = 0
    add(g, 0, 'Punching Poro', 'board', 'bf0')
    const t = add(g, 1, 'Mournful Witness', 'board', 'bf1')
    run(g, scoreBf(g, 0, 'bf0', 'hold'), [pick('Mournful Witness')])
    expect(t.loc).toBe('base1')
  })

  card('Gardens of Becoming', () => {
    const g = scene()
    g.bfs[0].card = byName('Gardens of Becoming')
    const u = add(g, 0, 'Punching Poro', 'board', 'bf0')
    add(g, 0, 'Shadow Fiend', 'board')
    act(g, 0, 'Punching Poro: Esaurisci: 1 XP')
    expect(g.players[0].xp).toBe(1)
    expect(u.exhausted).toBe(true)
    expect(can(g, 0, 'Shadow Fiend: Esaurisci')).toBe(false) // solo le unità lì
  })

  card('Ripper\'s Bay', () => {
    const g = scene()
    g.bfs[1].card = byName("Ripper's Bay")
    const u = add(g, 1, 'Mournful Witness', 'board', 'bf1')
    runes(g, 1, 'Calm')
    const before = g.players[1].runes.length
    run(g, returnToHand(g, u), [yes])
    expect(g.players[1].runes.length).toBe(before + 1)
  })

  card('Sprite', () => {
    const g = scene()
    run(g, playToken(g, 0, SPRITE, 'base0', { ready: true }))
    const s = named(g, 'Sprite')[0]
    expect(might(g, s)).toBe(3) // 187.2
    expect(s.card.tags).toEqual(['Fae'])
    expect(kw(g, s).temporary).toBe(true)
  })
})
