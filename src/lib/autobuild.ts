// Costruzione automatica di un mazzo con le carte possedute (regole di costruzione 103 e 487.4).
// Le carte si scelgono con i dati dei tornei recenti (effetto sulle vittorie, poi presenza nelle
// liste ben piazzate), mai con criteri inventati: senza dati per la Legend lo si dice.
import type { Card, Deck } from './types'
import { type CardDb, isBasePrinting, isBattlefield, isChampionUnit, isLegend, isMainDeckCard, isSignature, isToken, legendChampionTag } from './data'
import {
  BATTLEFIELDS_REQUIRED,
  MAIN_MIN,
  MAX_COPIES,
  MAX_SIGNATURE,
  RUNES_REQUIRED,
  deckOverall,
  fitsIdentity,
  isUnique,
  legendMeta,
  typicalCopies,
  validateDeck,
  type MetaData,
  type Overall,
} from './deck'

/** Da dove arriva una copia: `null` = sfusa, altrimenti il nome del mazzo posseduto che la contiene. */
export interface Origin {
  from: string | null
  q: number
}

export interface BuiltLine {
  card: Card
  qty: number
  origins: Origin[]
  /** Perché è stata scelta (dati dei tornei), vuoto se non ci sono dati. */
  why: string
}

export type AutoBuild =
  | { ok: false; problems: string[] }
  | {
      ok: true
      deck: Deck
      overall: Overall | null
      main: BuiltLine[]
      runes: BuiltLine[]
      battlefields: BuiltLine[]
      legend: BuiltLine
      notes: string[]
    }

/**
 * Copie disponibili per ogni stampa, divise per provenienza: prima le sfuse, poi quelle chiuse nei
 * mazzi posseduti e non liberati (solo se `useBoxed`).
 */
export function copySources(owned: Record<string, number>, decks: Deck[], useBoxed: boolean) {
  const boxes = new Map<string, Origin[]>()
  const locked: Record<string, number> = {}
  for (const d of decks) {
    if (!d.addedToCollection || d.released) continue
    for (const [id, q] of Object.entries(d.addedToCollection)) {
      locked[id] = (locked[id] ?? 0) + q
      const list = boxes.get(id) ?? []
      list.push({ from: d.name, q })
      boxes.set(id, list)
    }
  }
  const out = new Map<string, Origin[]>()
  for (const [id, total] of Object.entries(owned)) {
    if (total <= 0) continue
    const loose = Math.max(0, total - (locked[id] ?? 0))
    const list: Origin[] = loose > 0 ? [{ from: null, q: loose }] : []
    if (useBoxed) {
      // le copie chiuse possono superare quelle possedute se la collezione è stata ritoccata a mano
      let left = total - loose
      for (const b of boxes.get(id) ?? []) {
        const q = Math.min(b.q, left)
        if (q > 0) list.push({ from: b.from, q })
        left -= q
      }
    }
    if (list.length) out.set(id, list)
  }
  return out
}

/** Prende `n` copie di un nome dalle stampe disponibili: prima le sfuse, poi dai mazzi. */
function take(name: string, n: number, db: CardDb, pool: Map<string, Origin[]>) {
  const ids = [...pool.keys()].filter((id) => db.byId.get(id)?.name === name)
  const picks: { id: string; origins: Origin[] }[] = []
  let left = n
  // sfuse di tutte le stampe, poi quelle in scatola
  for (const loosePass of [true, false]) {
    for (const id of ids) {
      for (const o of pool.get(id)!) {
        if (left <= 0 || (o.from === null) !== loosePass || o.q <= 0) continue
        const q = Math.min(o.q, left)
        o.q -= q
        left -= q
        let p = picks.find((x) => x.id === id)
        if (!p) picks.push((p = { id, origins: [] }))
        const same = p.origins.find((x) => x.from === o.from)
        if (same) same.q += q
        else p.origins.push({ from: o.from, q })
      }
    }
  }
  return { picks, got: n - left }
}

const countName = (name: string, db: CardDb, pool: Map<string, Origin[]>) =>
  [...pool.entries()].reduce((a, [id, os]) => a + (db.byId.get(id)?.name === name ? os.reduce((s, o) => s + o.q, 0) : 0), 0)

const fromText = (os: Origin[]) => os.map((o) => `${o.q} ${o.from ? `dal mazzo ${o.from}` : o.q === 1 ? 'sfusa' : 'sfuse'}`).join(', ')
export { fromText }

export function autoBuild(
  legend: Card,
  champion: Card,
  db: CardDb,
  owned: Record<string, number>,
  decks: Deck[],
  meta: MetaData | null,
  useBoxed: boolean,
  name = `${champion.name.split(',')[0]} automatico`,
): AutoBuild {
  const problems: string[] = []
  const pool = copySources(owned, decks, useBoxed)
  const identity = legend.domains
  const tag = legendChampionTag(legend, db)
  if (!isLegend(legend)) return { ok: false, problems: [`${legend.name} non è una Legend.`] }
  if (!isChampionUnit(champion) || !tag || !champion.tags.includes(tag)) return { ok: false, problems: [`${champion.name} non è un campione con il tag ${tag}.`] }

  // Legend (103.2) e campione scelto (103.3.a): servono le carte vere
  const legendTake = take(legend.name, 1, db, pool)
  if (!legendTake.got) problems.push(`Non hai la Legend ${legend.name}${useBoxed ? '' : ' tra le carte sfuse'}.`)
  if (!countName(champion.name, db, pool)) problems.push(`Non hai il campione ${champion.name}${useBoxed ? '' : ' tra le carte sfuse'}.`)

  // Dati dei tornei per la Legend
  const m = meta ? legendMeta({ legendId: legend.id } as Deck, db, meta) : null
  const model = meta?.model && meta.legends[legend.name]?.model
  const effect = (n: string) => model?.cards[n] ?? 0
  const share = (n: string) => m?.cards[n]?.share ?? 0
  const typical = (c: Card) => {
    const u = m?.cards[c.name]
    return u ? typicalCopies(c, u.copies) : MAX_COPIES
  }

  // Carte legali che possiedi, una per nome
  const names = new Map<string, Card>()
  for (const id of pool.keys()) {
    const c = db.byId.get(id)
    if (!c || !isMainDeckCard(c) || isToken(c) || !fitsIdentity(c, identity)) continue
    if (isSignature(c) && !c.tags.includes(tag)) continue
    const prev = names.get(c.name)
    if (!prev || (!isBasePrinting(prev) && isBasePrinting(c))) names.set(c.name, c)
  }
  const ranked = [...names.values()].sort(
    (a, b) => effect(b.name) - effect(a.name) || share(b.name) - share(a.name) || (a.energy ?? 0) - (b.energy ?? 0) || a.name.localeCompare(b.name),
  )

  // Scelta: campione per primo, poi le copie tipiche delle migliori, poi copie in più fino a 40
  const qty = new Map<string, number>()
  let total = 0
  let signatures = 0
  const maxFor = (c: Card) => (isUnique(c) ? 1 : MAX_COPIES)
  const add = (c: Card, want: number) => {
    const have = qty.get(c.name) ?? 0
    let n = Math.min(want - have, maxFor(c) - have, countName(c.name, db, pool) - have, MAIN_MIN - total)
    if (isSignature(c)) n = Math.min(n, MAX_SIGNATURE - signatures)
    if (n <= 0) return
    qty.set(c.name, have + n)
    total += n
    if (isSignature(c)) signatures += n
  }
  add(names.get(champion.name) ?? champion, 1)
  for (const c of ranked) if (total < MAIN_MIN && effect(c.name) >= 0) add(c, Math.max(typical(c), c.name === champion.name ? 1 : 0))
  for (const c of ranked) if (total < MAIN_MIN && effect(c.name) >= 0) add(c, maxFor(c))
  for (const c of ranked) if (total < MAIN_MIN) add(c, maxFor(c)) // in fondo anche quelle con effetto negativo
  if (total < MAIN_MIN)
    problems.push(`Hai solo ${total} carte legali per questo mazzo${useBoxed ? '' : ' tra quelle sfuse'}: ne servono ${MAIN_MIN} (regola 103.3).`)

  // Rune (103.4): 12 dei domini della Legend, divise in base alla Power richiesta dalle carte scelte
  const runeCards = [...pool.keys()].map((id) => db.byId.get(id)!).filter((c) => c.type === 'Basic Rune' && fitsIdentity(c, identity))
  const runeAvail = new Map<string, number>()
  for (const r of runeCards) runeAvail.set(r.domains[0], (runeAvail.get(r.domains[0]) ?? 0) + countName(r.name, db, pool))
  const runeTotal = [...runeAvail.values()].reduce((a, b) => a + b, 0)
  if (runeTotal < RUNES_REQUIRED) problems.push(`Hai solo ${runeTotal} rune dei domini ${identity.join(' e ')}: ne servono ${RUNES_REQUIRED} (regola 103.4).`)

  // Campi (103.5, 487.4): 3 con nomi diversi
  const bfNames = [...new Set([...pool.keys()].map((id) => db.byId.get(id)!).filter((c) => isBattlefield(c) && !isToken(c) && fitsIdentity(c, identity)).map((c) => c.name))]
  if (bfNames.length < BATTLEFIELDS_REQUIRED) problems.push(`Hai solo ${bfNames.length} campi di battaglia diversi: ne servono ${BATTLEFIELDS_REQUIRED} (regola 487.4.a).`)

  if (problems.length) return { ok: false, problems }

  // Assegna le copie alle stampe, citando da dove arrivano
  const deck: Deck = { id: `deck-${Date.now().toString(36)}`, name, legendId: legend.id, championId: null, main: {}, runes: {}, battlefields: [], updatedAt: Date.now() }
  const main: BuiltLine[] = []
  const why = (n: string) => {
    const parts: string[] = []
    if (model && model.cards[n]) parts.push(`${model.cards[n] > 0 ? '+' : '−'}${Math.abs(model.cards[n] * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })} vittorie su 100 nelle liste che la usano`)
    if (m?.cards[n]) parts.push(`in ${Math.round(m.cards[n].share * 100)}% delle liste ben piazzate`)
    return parts.join(' · ')
  }
  for (const c of ranked.concat(names.has(champion.name) ? [] : [champion])) {
    const n = qty.get(c.name)
    if (!n) continue
    const { picks } = take(c.name, n, db, pool)
    for (const p of picks) deck.main[p.id] = (deck.main[p.id] ?? 0) + p.origins.reduce((a, o) => a + o.q, 0)
    if (c.name === champion.name) deck.championId = picks[0].id
    main.push({ card: c, qty: n, origins: picks.flatMap((p) => p.origins), why: why(c.name) })
  }
  const legendLine: BuiltLine = { card: legend, qty: 1, origins: legendTake.picks.flatMap((p) => p.origins), why: '' }

  // Rune in proporzione alla Power dei domini nelle carte scelte (almeno quelle possedute)
  const need = new Map<string, number>(identity.map((d) => [d, 0]))
  for (const l of main) for (const d of l.card.domains) if (need.has(d)) need.set(d, need.get(d)! + (l.card.power ?? 0) * l.qty)
  const demand = [...need.values()].reduce((a, b) => a + b, 0) || 1
  const target = new Map<string, number>()
  for (const d of identity) target.set(d, Math.min(runeAvail.get(d) ?? 0, Math.round((RUNES_REQUIRED * (need.get(d) ?? 0)) / demand)))
  let runeCount = [...target.values()].reduce((a, b) => a + b, 0)
  for (const d of [...identity].sort((a, b) => (need.get(b) ?? 0) - (need.get(a) ?? 0))) {
    while (runeCount < RUNES_REQUIRED && target.get(d)! < (runeAvail.get(d) ?? 0)) {
      target.set(d, target.get(d)! + 1)
      runeCount++
    }
  }
  for (const d of [...identity].sort((a, b) => (need.get(a) ?? 0) - (need.get(b) ?? 0))) {
    while (runeCount > RUNES_REQUIRED && target.get(d)! > 0) {
      target.set(d, target.get(d)! - 1)
      runeCount--
    }
  }
  const runes: BuiltLine[] = []
  for (const d of identity) {
    const r = runeCards.find((x) => x.domains[0] === d)
    const n = target.get(d) ?? 0
    if (!r || !n) continue
    const { picks } = take(r.name, n, db, pool)
    for (const p of picks) deck.runes[p.id] = (deck.runes[p.id] ?? 0) + p.origins.reduce((a, o) => a + o.q, 0)
    runes.push({ card: r, qty: n, origins: picks.flatMap((p) => p.origins), why: `Power ${d} richiesta dalle carte: ${need.get(d)}` })
  }

  // Campi: prima quelli sfusi (non ci sono dati di torneo sui campi)
  const bfLines: BuiltLine[] = []
  const bfSorted = bfNames.sort((a, b) => Number(isLoose(b)) - Number(isLoose(a)) || a.localeCompare(b))
  function isLoose(n: string) {
    return [...pool.entries()].some(([id, os]) => db.byId.get(id)?.name === n && os.some((o) => o.from === null && o.q > 0))
  }
  for (const n of bfSorted.slice(0, BATTLEFIELDS_REQUIRED)) {
    const { picks } = take(n, 1, db, pool)
    deck.battlefields.push(picks[0].id)
    bfLines.push({ card: db.byId.get(picks[0].id)!, qty: 1, origins: picks[0].origins, why: '' })
  }

  const notes: string[] = []
  if (!model && !m) notes.push('Nessun dato di torneo per questa Legend: le carte non sono scelte per forza, solo per legalità e costo.')
  notes.push('I campi di battaglia sono scelti tra i tuoi, prima gli sfusi: i dati dei tornei non dicono quali rendono di più.')
  const issues = validateDeck(deck, db)
  if (issues.length) return { ok: false, problems: issues.map((i) => `${i.text} (regola ${i.rule})`) }
  return { ok: true, deck, overall: meta ? deckOverall(deck, db, meta) : null, main, runes, battlefields: bfLines, legend: legendLine, notes }
}
