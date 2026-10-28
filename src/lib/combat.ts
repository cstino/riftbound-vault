// Motore di regole per gli allenamenti: combattimento e punteggio.
// Copre solo ciò che serve agli scenari, e ogni passaggio cita la regola del Core Rules (2026-10-09).
// Le unità usate negli scenari hanno solo Might e parole chiave gestite qui (Assault, Shield, Tank,
// Backline): nessuna altra abilità può cambiare l'esito.
import type { Card } from './types'

export type Role = 'attacker' | 'defender'

export interface CombatUnit {
  uid: string
  card: Card
  /** Might stampata (143.2). */
  might: number
  assault: number
  shield: number
  tank: boolean
  backline: boolean
  /** Stordita: non contribuisce ai danni (424.1.b). */
  stunned?: boolean
  /** Danni già segnati prima del combattimento (143.3). */
  damage?: number
}

const KW = /\[(Assault|Shield)(?:\s*(\d+))?\]|\[(Tank|Backline)\]/g

/** Legge dal testo della carta le parole chiave gestite dal motore. Senza numero valgono 1 (807.1.b.3, 814.1.b.3). */
export function unitFromCard(card: Card, uid: string, extra: Partial<CombatUnit> = {}): CombatUnit {
  const u: CombatUnit = { uid, card, might: card.might ?? 0, assault: 0, shield: 0, tank: false, backline: false, ...extra }
  for (const m of (card.text ?? '').matchAll(KW)) {
    if (m[1] === 'Assault') u.assault += Number(m[2] ?? 1) // 807.2: i valori si sommano
    else if (m[1] === 'Shield') u.shield += Number(m[2] ?? 1) // 814.2
    else if (m[3] === 'Tank') u.tank = true
    else if (m[3] === 'Backline') u.backline = true
  }
  return u
}

/** Might nel ruolo: Assault vale da attaccante (807.1.c), Shield da difensore (814.1.c). */
export function mightIn(u: CombatUnit, role: Role) {
  return u.might + (role === 'attacker' ? u.assault : u.shield)
}

/** Contributo ai danni: le unità stordite non contribuiscono (424.1.b); Might negativa conta 0 (143.2.c). */
export function damageContribution(u: CombatUnit, role: Role) {
  return u.stunned ? 0 : Math.max(0, mightIn(u, role))
}

/** Somma della Might di un lato (467.2.a / 467.2.b). */
export function totalDamage(units: CombatUnit[], role: Role) {
  return units.reduce((a, u) => a + damageContribution(u, role), 0)
}

/**
 * Danni letali da assegnare: danni non nulli che, con quelli già segnati, raggiungono la Might (467.2.c.2).
 * Anche un'unità stordita richiede la Might piena (424.1.c).
 */
export function lethalFor(u: CombatUnit, role: Role) {
  return Math.max(1, mightIn(u, role) - (u.damage ?? 0))
}

/** Priorità di assegnazione: prima Tank (815), poi le altre, per ultime Backline (826). */
function priority(u: CombatUnit) {
  return u.tank ? 0 : u.backline ? 2 : 1
}

export interface AssignmentIssue {
  rule: string
  text: string
}

/**
 * Controlla un'assegnazione dei danni secondo 467.2.c e le priorità di Tank e Backline.
 * `targets` sono le unità nemiche, `assign` i danni assegnati a ciascuna (per uid).
 */
export function checkAssignment(total: number, targets: CombatUnit[], targetRole: Role, assign: Record<string, number>): AssignmentIssue[] {
  const issues: AssignmentIssue[] = []
  const a = (u: CombatUnit) => assign[u.uid] ?? 0
  const L = (u: CombatUnit) => lethalFor(u, targetRole)
  const sum = targets.reduce((s, u) => s + a(u), 0)

  if (sum !== total) {
    issues.push({
      rule: '467.2.c',
      text: sum < total ? `Devi assegnare tutti i ${total} danni: ne mancano ${total - sum}.` : `Hai assegnato ${sum} danni, ma ne hai solo ${total}.`,
    })
  }
  // 467.2.c.3: danni letali per intero prima di passare a un'altra unità → al massimo un'unità "a metà"
  const partial = targets.filter((u) => a(u) > 0 && a(u) < L(u))
  if (partial.length > 1) {
    issues.push({
      rule: '467.2.c.3',
      text: `Devi assegnare danni letali a un’unità prima di passare alla successiva: ${partial.map((u) => u.card.name).join(' e ')} hanno entrambe danni non letali.`,
    })
  }
  // 467.2.c.4: non più del letale, a meno che non ci siano altre unità a cui assegnare danni
  const allLethal = targets.every((u) => a(u) >= L(u))
  const over = targets.filter((u) => a(u) > L(u))
  if (over.length && !allLethal) {
    issues.push({
      rule: '467.2.c.4',
      text: `${over[0].card.name} ha più danni del necessario (${L(over[0])} bastano) mentre altre unità non hanno ancora danni letali.`,
    })
  }
  // Tank prima (815.1.c.2), Backline dopo (826.4.b): un gruppo successivo riceve danni solo se il precedente è tutto letale
  for (const level of [1, 2]) {
    const later = targets.filter((u) => priority(u) >= level && a(u) > 0)
    const earlierNotLethal = targets.filter((u) => priority(u) < level && a(u) < L(u))
    if (later.length && earlierNotLethal.length) {
      const blocker = earlierNotLethal[0]
      issues.push(
        blocker.tank
          ? { rule: '815.1.c.2', text: `${blocker.card.name} ha Tank: deve ricevere danni letali prima delle unità senza Tank.` }
          : { rule: '826.4.b', text: `Le unità con Backline ricevono danni solo dopo che tutte le altre hanno danni letali.` },
      )
      break
    }
  }
  return issues
}

/**
 * Assegnazione legale scelta dal PC: rispetta le priorità e cerca di uccidere più unità possibile,
 * partendo da quelle che richiedono meno danni. Il resto va sull'ultima unità (467.2.c.4).
 */
export function autoAssign(total: number, targets: CombatUnit[], targetRole: Role): Record<string, number> {
  const order = [...targets].sort((x, y) => priority(x) - priority(y) || lethalFor(x, targetRole) - lethalFor(y, targetRole))
  const out: Record<string, number> = {}
  let left = total
  for (const u of order) {
    if (left <= 0) break
    // non si può saltare un'unità della stessa priorità o superiore senza averla resa letale
    const give = Math.min(left, lethalFor(u, targetRole))
    out[u.uid] = give
    left -= give
  }
  if (left > 0 && order.length) {
    const last = order[order.length - 1]
    out[last.uid] = (out[last.uid] ?? 0) + left
  }
  return out
}

export interface ScoreState {
  /** Punti di chi attacca prima del combattimento. */
  points: number
  victory: number
  /** Campi in gioco (nel duello sono 2, 487.4). */
  battlefields: number
  /** Campi su cui chi attacca ha già segnato in questo turno, escluso questo. */
  scoredOthers: number
}

export type CombatOutcome =
  | { kind: 'conquer'; gainPoint: boolean; drawInstead: boolean; wins: boolean }
  | { kind: 'defender-holds' }
  | { kind: 'no-result' }
  | { kind: 'uncontrolled' }

export interface CombatResolution {
  attackerAssign: Record<string, number>
  defenderAssign: Record<string, number>
  deadAttackers: string[]
  deadDefenders: string[]
  outcome: CombatOutcome
  steps: { text: string; rule: string }[]
}

/** Risolve un combattimento in cui il difensore controlla il campo (466-468) e calcola il punteggio (471-474). */
export function resolveCombat(
  attackers: CombatUnit[],
  defenders: CombatUnit[],
  attackerAssign: Record<string, number>,
  score: ScoreState,
): CombatResolution {
  const steps: CombatResolution['steps'] = []
  const atkTotal = totalDamage(attackers, 'attacker')
  const defTotal = totalDamage(defenders, 'defender')
  const defenderAssign = autoAssign(defTotal, attackers, 'attacker')
  steps.push({ rule: '467.2.a', text: `Gli attaccanti sommano ${atkTotal} di Might, i difensori ${defTotal}.` })
  steps.push({ rule: '467.2.c', text: 'Prima l’attaccante assegna i suoi danni, poi il difensore; poi tutti i danni vengono inflitti insieme.' })

  const dead = (units: CombatUnit[], assign: Record<string, number>, role: Role) =>
    units.filter((u) => (u.damage ?? 0) + (assign[u.uid] ?? 0) >= Math.max(1, mightIn(u, role))).map((u) => u.uid)
  const deadDefenders = dead(defenders, attackerAssign, 'defender')
  const deadAttackers = dead(attackers, defenderAssign, 'attacker')
  const killed = [...attackers, ...defenders].filter((u) => deadDefenders.includes(u.uid) || deadAttackers.includes(u.uid))
  steps.push({
    rule: '143.2.b',
    text: killed.length ? `Muoiono le unità con danni pari o superiori alla loro Might: ${killed.map((u) => u.card.name).join(', ')}.` : 'Nessuna unità ha danni letali: nessuna muore.',
  })

  const atkLeft = attackers.length - deadAttackers.length
  const defLeft = defenders.length - deadDefenders.length
  let outcome: CombatOutcome
  if (atkLeft > 0 && defLeft > 0) {
    outcome = { kind: 'no-result' }
    steps.push({ rule: '468.1.a.2', text: 'Restano unità di entrambi i lati: gli attaccanti tornano nella loro base. Il campo resta al difensore.' })
  } else if (atkLeft > 0) {
    // 468.5: chi resta stabilisce il controllo; è una conquista se non ha già segnato qui (468.5.d)
    const final = score.points >= score.victory - 1
    const allScored = score.scoredOthers + 1 >= score.battlefields
    const gainPoint = !final || allScored
    outcome = { kind: 'conquer', gainPoint, drawInstead: !gainPoint, wins: gainPoint && score.points + 1 >= score.victory }
    steps.push({ rule: '468.5', text: 'Restano solo gli attaccanti: prendi il controllo del campo. È una conquista.' })
    if (final) {
      steps.push(
        allScored
          ? { rule: '473.1.b.1', text: 'È il punto finale e in questo turno hai segnato su tutti i campi: lo guadagni.' }
          : { rule: '473.1.b.1', text: 'Sarebbe il punto finale, ma in questo turno non hai segnato su tutti i campi: peschi una carta invece del punto.' },
      )
    } else {
      steps.push({ rule: '471.1', text: 'La conquista ti fa guadagnare 1 punto.' })
    }
    if (outcome.wins) steps.push({ rule: '474', text: `Arrivi a ${score.victory} punti: nel cleanup vinci la partita.` })
  } else if (defLeft > 0) {
    outcome = { kind: 'defender-holds' }
    steps.push({ rule: '468.5', text: 'Restano solo i difensori: il campo resta a loro. Non c’è conquista, perché lo controllavano già.' })
  } else {
    outcome = { kind: 'uncontrolled' }
    steps.push({ rule: '468.5.b', text: 'Non resta nessuna unità: il campo non è più controllato da nessuno.' })
  }
  return { attackerAssign, defenderAssign, deadAttackers, deadDefenders, outcome, steps }
}
