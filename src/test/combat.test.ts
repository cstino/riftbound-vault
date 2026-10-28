import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Card } from '../lib/types'
import { autoAssign, checkAssignment, lethalFor, mightIn, resolveCombat, totalDamage, unitFromCard, type CombatUnit } from '../lib/combat'

const cards: Card[] = JSON.parse(readFileSync('public/data/cards.json', 'utf8'))
const byName = (n: string) => cards.find((c) => c.name === n && !c.alt_art)!
let n = 0
const unit = (name: string, extra: Partial<CombatUnit> = {}) => unitFromCard(byName(name), `u${n++}`, extra)
/** Unità senza testo con la Might voluta, per riprodurre gli esempi del regolamento. */
const plain = (might: number, extra: Partial<CombatUnit> = {}): CombatUnit => ({
  uid: `p${n++}`, card: { ...byName('Shipyard Skulker'), name: `Unità ${might}` }, might, assault: 0, shield: 0, tank: false, backline: false, ...extra,
})
const rulesOf = (issues: { rule: string }[]) => issues.map((i) => i.rule)

describe('parole chiave lette dalle carte', () => {
  it('Laurent Duelist: Assault 2 solo in attacco (807.1.c)', () => {
    const u = unit('Laurent Duelist')
    expect([mightIn(u, 'attacker'), mightIn(u, 'defender')]).toEqual([5, 3])
  })
  it('Stalwart Poro: Shield senza numero vale 1 (814.1.b.3)', () => {
    expect(mightIn(unit('Stalwart Poro'), 'defender')).toBe(3)
  })
  it('Towering Combatant: Shield 2 e Tank', () => {
    const u = unit('Towering Combatant')
    expect([mightIn(u, 'defender'), u.tank]).toEqual([5, true])
  })
})

describe('assegnazione dei danni (467.2.c)', () => {
  it('esempio di 467.2.c.3: 5 danni su quattro unità da 3, non 2-1-1-1', () => {
    const t = [plain(3), plain(3), plain(3), plain(3)]
    expect(rulesOf(checkAssignment(5, t, 'defender', { [t[0].uid]: 2, [t[1].uid]: 1, [t[2].uid]: 1, [t[3].uid]: 1 }))).toContain('467.2.c.3')
    expect(checkAssignment(5, t, 'defender', { [t[0].uid]: 3, [t[1].uid]: 2 })).toEqual([])
  })
  it('esempio di 467.2.c.4: con 1 danno già segnato non si assegnano più di 2 danni a un’unità', () => {
    const t = [plain(3, { damage: 1 }), plain(3, { damage: 1 }), plain(3, { damage: 1 }), plain(3, { damage: 1 })]
    expect(lethalFor(t[0], 'defender')).toBe(2)
    expect(rulesOf(checkAssignment(5, t, 'defender', { [t[0].uid]: 3, [t[1].uid]: 2 }))).toContain('467.2.c.4')
    expect(checkAssignment(5, t, 'defender', { [t[0].uid]: 2, [t[1].uid]: 2, [t[2].uid]: 1 })).toEqual([])
  })
  it('si possono assegnare danni in eccesso solo se tutte le unità hanno danni letali', () => {
    const t = [plain(2), plain(2)]
    expect(checkAssignment(6, t, 'defender', { [t[0].uid]: 4, [t[1].uid]: 2 })).toEqual([])
  })
  it('tutti i danni vanno assegnati', () => {
    const t = [plain(3)]
    expect(rulesOf(checkAssignment(5, t, 'defender', { [t[0].uid]: 3 }))).toContain('467.2.c')
  })
  it('Tank riceve danni letali per primo (815)', () => {
    const tank = unit('Horns of the Dragon') // 6 Might, Tank
    const other = plain(2)
    expect(rulesOf(checkAssignment(7, [tank, other], 'defender', { [tank.uid]: 5, [other.uid]: 2 }))).toContain('815.1.c.2')
    expect(checkAssignment(7, [tank, other], 'defender', { [tank.uid]: 6, [other.uid]: 1 })).toEqual([])
  })
  it('Backline riceve danni solo dopo le altre (826)', () => {
    const back = plain(2, { backline: true })
    const other = plain(3)
    expect(rulesOf(checkAssignment(4, [back, other], 'defender', { [back.uid]: 2, [other.uid]: 2 }))).toContain('826.4.b')
    expect(checkAssignment(4, [back, other], 'defender', { [other.uid]: 3, [back.uid]: 1 })).toEqual([])
  })
  it('l’assegnazione del PC è sempre legale', () => {
    const t = [unit('Sunlit Guardian'), unit('Mega-Mech'), plain(2), plain(4, { damage: 1 })]
    for (let total = 0; total <= 25; total++) expect(checkAssignment(total, t, 'attacker', autoAssign(total, t, 'attacker'))).toEqual([])
  })
})

describe('stordimento (424)', () => {
  it('un’unità stordita non contribuisce ai danni ma serve la Might piena per ucciderla', () => {
    const s = plain(4, { stunned: true })
    expect(totalDamage([s, plain(2)], 'attacker')).toBe(2)
    expect(lethalFor(s, 'defender')).toBe(4)
  })
})

describe('esito e punteggio (468, 471-474)', () => {
  const score = { points: 3, victory: 8, battlefields: 2, scoredOthers: 0 }
  it('conquista: restano solo gli attaccanti e si guadagna 1 punto', () => {
    const a = [plain(5)]
    const d = [plain(3)]
    const r = resolveCombat(a, d, { [d[0].uid]: 5 }, score)
    expect(r.deadDefenders).toEqual([d[0].uid])
    expect(r.outcome).toEqual({ kind: 'conquer', gainPoint: true, drawInstead: false, wins: false })
  })
  it('restano unità di entrambi i lati: gli attaccanti tornano alla base', () => {
    const a = [plain(2)]
    const d = [plain(5)]
    expect(resolveCombat(a, d, { [d[0].uid]: 2 }, score).outcome.kind).toBe('defender-holds')
    // difensore stordito: non fa danni (424.1.b); l'attaccante da 2 non uccide il difensore da 3
    const a3 = [plain(2)]
    const d3 = [plain(3, { stunned: true })]
    const r3 = resolveCombat(a3, d3, { [d3[0].uid]: 2 }, score)
    expect(r3.outcome.kind).toBe('no-result')
    expect(r3.steps.map((s) => s.rule)).toContain('468.1.a.2')
  })
  it('ultimo punto con una conquista senza aver segnato tutti i campi: si pesca (473.1.b.1)', () => {
    const d = [plain(1)]
    const r = resolveCombat([plain(5)], d, { [d[0].uid]: 5 }, { points: 7, victory: 8, battlefields: 2, scoredOthers: 0 })
    expect(r.outcome).toEqual({ kind: 'conquer', gainPoint: false, drawInstead: true, wins: false })
  })
  it('ultimo punto dopo aver segnato l’altro campo: si vince', () => {
    const d = [plain(1)]
    const r = resolveCombat([plain(5)], d, { [d[0].uid]: 5 }, { points: 7, victory: 8, battlefields: 2, scoredOthers: 1 })
    expect(r.outcome).toEqual({ kind: 'conquer', gainPoint: true, drawInstead: false, wins: true })
  })
  it('se muoiono tutti il campo non è controllato da nessuno (468.5.b)', () => {
    const a = [plain(3)]
    const d = [plain(3)]
    expect(resolveCombat(a, d, { [d[0].uid]: 3 }, score).outcome.kind).toBe('uncontrolled')
  })
})
