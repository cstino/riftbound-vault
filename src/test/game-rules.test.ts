// Regole del motore di partita, verificate su scenari costruiti a mano (Core Rules 2026-10-09).
import { describe, expect, it } from 'vitest'
import {
  available,
  createGame,
  draw,
  kw,
  might,
  pay,
  runGame,
  scoreBf,
  standardDests,
  units,
} from '../lib/game/engine'
import type { Decision, Game, PID } from '../lib/game/types'
import { act, add, drive, logText, pick, runes, scene, top } from './gameScene'
import { spec } from './gameHelpers'

const can = (g: Game, p: PID, label: string) => available(g, p).some((x) => x.label.includes(label))

describe('preparazione e turno', () => {
  it('116-117 e 487.7: si pescano 4 carte; il secondo giocatore canalizza 3 rune al primo turno', () => {
    const g = createGame([spec('Zed'), spec('Shen')], ['Zed', 'Shen'], 3)
    const gen = runGame(g)
    let r = gen.next()
    const runesAt: Record<number, number> = {}
    while (!r.done && g.turn <= 2) {
      const d = r.value as Decision
      if (d.type === 'act' && d.context === 'main') runesAt[g.turn] = g.players[g.turnPlayer].runes.length
      r = gen.next(d.type === 'choose' ? (d.min === 0 ? [] : [0]) : d.type === 'act' ? 'end' : {})
    }
    expect(runesAt[1]).toBe(2)
    expect(runesAt[2]).toBe(3)
    const second = g.players[g.first === 0 ? 1 : 0]
    expect(second.hand.length).toBe(5) // 4 + la pescata del primo turno
  })

  it('117: il mulligan rimette in fondo al mazzo al massimo 2 carte', () => {
    const g = createGame([spec('Zed'), spec('Shen')], ['Zed', 'Shen'], 4)
    const gen = runGame(g)
    let r = gen.next()
    const d = r.value as Decision
    expect(d.type === 'choose' && d.max).toBe(2)
    const pl = g.players[g.first]
    const before = pl.hand.slice(0, 2).map((u) => g.objs.get(u)!.card.name).sort()
    r = gen.next([0, 1])
    expect(pl.hand.length).toBe(4)
    expect(pl.deck.slice(-2).map((u) => g.objs.get(u)!.card.name).sort()).toEqual(before)
  })

  it('164.2: si paga esaurendo le rune e riciclando per la Power la stessa runa', () => {
    const g = scene()
    runes(g, 1, 'Calm', 'Calm', 'Calm', 'Order')
    pay(g, 1, { energy: 4, power: [['Order']] })
    const pl = g.players[1]
    expect(pl.runes.length).toBe(3)
    expect(pl.runes.every((u) => g.objs.get(u)!.exhausted)).toBe(true)
    expect(g.objs.get(pl.runeDeck[pl.runeDeck.length - 1])!.card.name).toBe('Order Rune')
  })

  it('414.4 e 432: pescare da un mazzo vuoto causa un Burn Out e l’avversario guadagna 1 punto', () => {
    const g = scene()
    const pl = g.players[0]
    pl.deck.length = 0
    add(g, 0, 'Ruthless Strike', 'trash')
    drive(draw(g, 0, 1))
    expect(g.players[1].points).toBe(1)
    expect(pl.hand.map((u) => g.objs.get(u)!.card.name)).toEqual(['Ruthless Strike'])
  })
})

describe('movimento, showdown e punteggio', () => {
  it('144 e 471.1: muoversi in un campo vuoto apre uno showdown e conquistarlo dà 1 punto', () => {
    const g = scene()
    add(g, 0, 'Punching Poro', 'board')
    act(g, 0, 'Muovi', [pick('Punching Poro'), pick('Grove')])
    expect(g.bfs[1].controller).toBe(0)
    expect(g.players[0].points).toBe(1)
    expect(logText(g)).toMatch(/Showdown/)
    // 144.2: il movimento esaurisce l'unità
    expect(units(g)[0].exhausted).toBe(true)
  })

  it('472: si segna una sola volta per campo per turno', () => {
    const g = scene()
    g.bfs[1].controller = 0
    add(g, 0, 'Punching Poro', 'board', 'bf1')
    drive(scoreBf(g, 0, 'bf1', 'hold'))
    drive(scoreBf(g, 0, 'bf1', 'conquer'))
    expect(g.players[0].points).toBe(1)
  })

  it('473.1.b.1: il punto finale da una conquista richiede di aver segnato su tutti i campi, altrimenti si pesca', () => {
    const g = scene()
    g.players[0].points = 7
    const hand = g.players[0].hand.length
    add(g, 0, 'Punching Poro', 'board')
    act(g, 0, 'Muovi', [pick('Punching Poro'), pick('Grove')])
    expect(g.players[0].points).toBe(7)
    expect(g.players[0].hand.length).toBe(hand + 1)
    expect(g.winner).toBeNull()
  })

  it('323.1: con 8 punti si vince nel cleanup', () => {
    const g = scene()
    g.players[0].points = 7
    g.players[0].scored = ['bf0']
    add(g, 0, 'Punching Poro', 'board')
    act(g, 0, 'Muovi', [pick('Punching Poro'), pick('Grove')])
    expect(g.winner).toBe(0)
  })

  it('323.5: senza unità in un campo se ne perde il controllo', () => {
    const g = scene()
    g.bfs[1].controller = 0
    const poro = add(g, 0, 'Punching Poro', 'board', 'bf1')
    act(g, 0, 'Muovi', [pick('Punching Poro'), pick('La tua base')])
    expect(poro.loc).toBe('base0')
    expect(g.bfs[1].controller).toBeNull()
  })

  it('810: senza Ganking un’unità in un campo può tornare solo alla base', () => {
    const g = scene()
    const poro = add(g, 0, 'Punching Poro', 'board', 'bf1')
    expect(standardDests(g, poro)).toEqual(['base0'])
  })
})

describe('combattimento', () => {
  it('466-468: chi attacca e vince conquista; con difensori rimasti gli attaccanti tornano alla base', () => {
    const g = scene()
    g.bfs[1].controller = 1
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    const assassin = add(g, 0, 'Shadow Assassin', 'board')
    act(g, 0, 'Muovi', [pick('Shadow Assassin'), pick('Grove')])
    expect(g.bfs[1].controller).toBe(0)
    expect(g.players[1].trash.map((u) => g.objs.get(u)!.card.name)).toContain('Soulspinner')
    expect(assassin.damage).toBe(0) // 468.1.a.1: dopo il combattimento le unità guariscono

    const h = scene()
    h.bfs[1].controller = 1
    add(h, 1, 'Pakaa Protector', 'board', 'bf1')
    const poro = add(h, 0, 'Punching Poro', 'board')
    act(h, 0, 'Muovi', [pick('Punching Poro'), pick('Grove')])
    expect(h.players[0].trash.map((u) => h.objs.get(u)!.card.name)).toEqual(['Punching Poro'])
    expect(h.bfs[1].controller).toBe(1)
    expect(h.objs.has(poro.uid)).toBe(false)
  })

  it('468.1.a.2: se restano unità di entrambi, gli attaccanti tornano nella base', () => {
    const g = scene()
    g.bfs[1].controller = 1
    add(g, 1, 'Sacred Protector', 'board', 'bf1') // 6 Might, da solo non infligge danni
    const a = add(g, 0, 'Shadow Assassin', 'board')
    act(g, 0, 'Muovi', [pick('Shadow Assassin'), pick('Grove')])
    expect(a.loc).toBe('base0')
    expect(g.bfs[1].controller).toBe(1)
  })

  it('815.1.c.2: un’assegnazione che salta il Tank viene rifiutata e richiesta', () => {
    const g = scene()
    g.bfs[1].controller = 1
    const tank = add(g, 1, 'Shen, Kinkou', 'board', 'bf1')
    const other = add(g, 1, 'Mournful Witness', 'board', 'bf1')
    add(g, 0, 'Shadowblade Lurker', 'board')
    const wrong = { [String(other.uid)]: 5 }
    const right = { [String(tank.uid)]: 5 }
    let asked = 0
    act(g, 0, 'Muovi', [pick('Shadowblade Lurker'), pick('Grove')], (d) => (d.type === 'assign' && d.player === 0 ? (asked++ ? right : wrong) : undefined))
    expect(asked).toBe(2)
    expect(g.players[1].trash.map((u) => g.objs.get(u)!.card.name)).toContain('Shen, Kinkou')
  })

  it('424.1.b: un’unità stordita non infligge danni in combattimento', () => {
    const g = scene()
    g.bfs[1].controller = 1
    const d = add(g, 1, 'Pakaa Protector', 'board', 'bf1')
    d.stunned = true
    const a = add(g, 0, 'Punching Poro', 'board')
    act(g, 0, 'Muovi', [pick('Punching Poro'), pick('Grove')])
    expect(a.zone).toBe('board')
    expect(logText(g)).toMatch(/i difensori 0/)
  })
})

describe('tempi di gioco', () => {
  it('309.1.a e 813: con la catena aperta si possono giocare solo carte con Reaction', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Chaos', 'Chaos')
    runes(g, 1, 'Calm', 'Calm', 'Order', 'Order')
    add(g, 0, 'Ruthless Strike')
    add(g, 1, 'Discipline')
    add(g, 1, 'Charm')
    g.bfs[1].controller = 1
    add(g, 1, 'Soulspinner', 'board', 'bf1')
    const seen: string[][] = []
    act(g, 0, 'Ruthless Strike', [pick('Soulspinner'), (d) => {
      if (d.type === 'act') seen.push(d.actions.map((a) => a.label))
      return 'pass'
    }])
    expect(seen[0]).toContain('Gioca Discipline')
    expect(seen[0]).not.toContain('Gioca Charm')
  })

  it('308.1.a: in uno showdown solo Action e Reaction; le unità normali no', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury', 'Fury', 'Chaos', 'Chaos')
    add(g, 0, 'Wind and Ghosts')
    add(g, 0, 'Punching Poro')
    add(g, 0, 'Shadow Assassin', 'board')
    const offered: string[][] = []
    act(g, 0, 'Muovi', [pick('Shadow Assassin'), pick('Grove'), (d) => {
      if (d.type === 'act') offered.push(d.actions.map((a) => a.label))
      return 'pass'
    }])
    expect(offered[0]).toContain('Gioca Wind and Ghosts')
    expect(offered[0]).not.toContain('Gioca Punching Poro')
  })

  it('811: una carta nascosta costa 1 Power, si gioca dal turno dopo per 0 e ha Reaction', () => {
    const g = scene()
    g.turnPlayer = 1
    g.bfs[1].controller = 1
    add(g, 1, 'Mournful Witness', 'board', 'bf1')
    runes(g, 1, 'Calm')
    add(g, 1, 'Disciple of Shen')
    act(g, 1, 'Nascondi Disciple of Shen', [pick('Grove')])
    expect(g.bfs[1].facedown.length).toBe(1)
    expect(g.players[1].runes.length).toBe(0)
    expect(can(g, 1, 'da nascosta')).toBe(false) // stesso turno
    g.turn++
    g.turnPlayer = 0
    expect(can(g, 1, 'da nascosta')).toBe(false) // nessuna catena, nessun focus
    // nel turno successivo può reagire a una magia dell'avversario
    runes(g, 0, 'Fury', 'Fury', 'Fury')
    add(g, 0, 'Ruthless Strike')
    let offered: string[] = []
    act(g, 0, 'Ruthless Strike', [pick('Mournful Witness'), (d) => {
      if (d.type === 'act') offered = d.actions.map((a) => a.label)
      return d.type === 'act' ? (d.actions.find((a) => a.label.includes('da nascosta'))?.id ?? 'pass') : [0]
    }])
    expect(offered.some((l) => l.includes('Disciple of Shen da nascosta'))).toBe(true)
    expect(units(g).some((u) => u.card.name === 'Disciple of Shen' && u.loc === 'bf1')).toBe(true)
  })

  it('809: Deflect fa pagare 1 Power in più all’avversario che lo sceglie', () => {
    const g = scene()
    add(g, 1, 'Steel Paws', 'board', 'bf1')
    add(g, 0, 'Ruthless Strike')
    runes(g, 0, 'Fury', 'Fury', 'Fury')
    expect(can(g, 0, 'Ruthless Strike')).toBe(true)
    // con solo 3 rune riciclate per l'energia... le stesse rune possono anche dare la Power
    act(g, 0, 'Ruthless Strike', [pick('Steel Paws')])
    expect(g.players[0].runes.length).toBe(2)
    expect(logText(g)).toMatch(/Deflect/)
  })
})

describe('caratteristiche', () => {
  it('143.4: le unità entrano esauste', () => {
    const g = scene()
    runes(g, 0, 'Fury', 'Fury')
    add(g, 0, 'Punching Poro')
    act(g, 0, 'Gioca Punching Poro')
    expect(units(g)[0].exhausted).toBe(true)
  })

  it('807 e 814: Assault vale solo in attacco, Shield solo in difesa', () => {
    const g = scene()
    const shen = add(g, 1, 'Shen, Kinkou', 'board', 'bf1')
    expect(might(g, shen)).toBe(3)
    shen.role = 'defender'
    expect(might(g, shen)).toBe(5)
    shen.role = 'attacker'
    expect(might(g, shen)).toBe(3)
    expect(kw(g, shen).tank).toBe(true)
  })

  it('top: le carte messe in cima al mazzo si pescano per prime', () => {
    const g = scene()
    top(g, 0, 'Charm')
    drive(draw(g, 0, 1))
    expect(g.objs.get(g.players[0].hand[0])!.card.name).toBe('Charm')
  })
})

describe('mazzo in partita', () => {
  it('112: il campione scelto va nella sua zona, il resto (39 carte) nel mazzo principale', async () => {
    const { deckToSpec } = await import('../lib/game')
    const { officialDeck, db } = await import('./gameHelpers')
    const s = deckToSpec(officialDeck('Zed'), db)
    expect(s.main.length).toBe(39)
    expect(s.champion.name).toBe('Zed, Without a Sound')
    expect(s.runes.length).toBe(12)
    expect(s.battlefields.length).toBe(3)
  })
})
