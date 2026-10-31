// Costruzione del mazzo secondo il Core Rules, sezione 103 (e 487.4 per il duello).
import type { Card, Deck, Domain } from './types'
import {
  type CardDb,
  isBasePrinting,
  isBattlefield,
  isChampionUnit,
  isLegend,
  isMainDeckCard,
  isRune,
  isSignature,
  isToken,
  legendChampionTag,
} from './data'

export const MAIN_MIN = 40
export const RUNES_REQUIRED = 12
export const BATTLEFIELDS_REQUIRED = 3
export const MAX_COPIES = 3
export const MAX_SIGNATURE = 3

export type IssueLevel = 'error' | 'todo'
export interface Issue {
  level: IssueLevel
  rule: string
  text: string
}

export const isUnique = (c: Card) => /\[Unique\]/.test(c.text ?? '')

/** Una carta rispetta la Domain Identity se tutti i suoi domini sono tra quelli della Legend (103.2.b). */
export function fitsIdentity(c: Card, identity: Domain[]) {
  // "Colorless" nei dati equivale a nessun dominio: carta ammessa in ogni mazzo (103.2.b.5)
  return c.domains.every((d) => (d as string) === 'Colorless' || identity.includes(d))
}

export function countOf(rec: Record<string, number>) {
  return Object.values(rec).reduce((a, b) => a + b, 0)
}

export function identityOf(deck: Deck, db: CardDb): Domain[] {
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  return legend?.domains ?? []
}

export function validateDeck(deck: Deck, db: CardDb): Issue[] {
  const issues: Issue[] = []
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  if (!legend || !isLegend(legend)) {
    issues.push({ level: 'todo', rule: '103.2', text: 'Scegli una Champion Legend: decide i domini del mazzo.' })
    return issues
  }
  const identity = legend.domains
  const tag = legendChampionTag(legend, db)

  // Campione scelto
  const champ = deck.championId ? db.byId.get(deck.championId) : undefined
  if (!champ) {
    issues.push({ level: 'todo', rule: '103.3.a', text: `Scegli il campione: un’unità campione con il tag ${tag ?? 'della Legend'}.` })
  } else if (!isChampionUnit(champ) || (tag && !champ.tags.includes(tag))) {
    issues.push({ level: 'error', rule: '103.3.a.2', text: `${champ.name} non può essere il campione scelto: serve un’unità campione con il tag ${tag}.` })
  } else if (!deck.main[champ.id]) {
    issues.push({ level: 'error', rule: '103.3', text: 'Il campione scelto deve far parte del mazzo principale.' })
  }

  // Mazzo principale
  const entries = Object.entries(deck.main).filter(([, q]) => q > 0)
  const total = countOf(deck.main)
  if (total < MAIN_MIN) {
    issues.push({ level: 'todo', rule: '103.3', text: `Il mazzo principale ha ${total} carte: ne servono almeno ${MAIN_MIN}.` })
  }
  const byName = new Map<string, { card: Card; qty: number }>()
  let signatures = 0
  for (const [id, qty] of entries) {
    const c = db.byId.get(id)
    if (!c) continue
    if (!isMainDeckCard(c)) {
      issues.push({ level: 'error', rule: '103.3', text: `${c.name} non può stare nel mazzo principale (${c.type || 'tipo speciale'}).` })
      continue
    }
    if (!fitsIdentity(c, identity)) {
      issues.push({ level: 'error', rule: '103.2.b', text: `${c.name} è ${c.domains.join(' / ')}: fuori dai domini della Legend (${identity.join(' / ')}).` })
    }
    if (isSignature(c)) {
      signatures += qty
      if (tag && !c.tags.includes(tag)) {
        issues.push({ level: 'error', rule: '103.3.d.2', text: `${c.name} è una Signature di un altro campione: serve il tag ${tag}.` })
      }
    }
    const prev = byName.get(c.name)
    byName.set(c.name, { card: c, qty: (prev?.qty ?? 0) + qty })
  }
  for (const { card, qty } of byName.values()) {
    if (isUnique(card) && qty > 1) {
      issues.push({ level: 'error', rule: '825.3.a', text: `${card.name} è Unique: puoi averne una sola copia (ne hai ${qty}).` })
    } else if (qty > MAX_COPIES && !/any number of cards named/i.test(card.text ?? '')) {
      // 002: il testo della carta vince sulla regola (Spiderling: "Your deck can have any number of cards named Spiderling")
      issues.push({ level: 'error', rule: '103.3.b', text: `${card.name}: massimo ${MAX_COPIES} copie con lo stesso nome (ne hai ${qty}).` })
    }
  }
  if (signatures > MAX_SIGNATURE) {
    issues.push({ level: 'error', rule: '103.3.d.1', text: `Hai ${signatures} carte Signature: il massimo è ${MAX_SIGNATURE}.` })
  }

  // Rune
  const runeTotal = countOf(deck.runes)
  for (const id of Object.keys(deck.runes)) {
    const r = db.byId.get(id)
    if (r && (!isRune(r) || !fitsIdentity(r, identity))) {
      issues.push({ level: 'error', rule: '103.4.a.1', text: `${r.name} non è una runa dei domini della Legend.` })
    }
  }
  if (runeTotal !== RUNES_REQUIRED) {
    issues.push({
      level: runeTotal > RUNES_REQUIRED ? 'error' : 'todo',
      rule: '103.4.a',
      text: `Il mazzo delle rune ha ${runeTotal} rune: devono essere esattamente ${RUNES_REQUIRED}.`,
    })
  }

  // Campi di battaglia
  const bfNames = deck.battlefields.map((id) => db.byId.get(id)?.name)
  if (new Set(bfNames).size !== bfNames.length) {
    issues.push({ level: 'error', rule: '103.5.c', text: 'Non puoi portare due campi di battaglia con lo stesso nome.' })
  }
  for (const id of deck.battlefields) {
    const b = db.byId.get(id)
    if (b && (!isBattlefield(b) || !fitsIdentity(b, identity))) {
      issues.push({ level: 'error', rule: '103.5.b', text: `${b.name} non è un campo di battaglia valido per questo mazzo.` })
    }
  }
  if (deck.battlefields.length !== BATTLEFIELDS_REQUIRED) {
    issues.push({
      level: deck.battlefields.length > BATTLEFIELDS_REQUIRED ? 'error' : 'todo',
      rule: '487.4.a',
      text: `Campi di battaglia: ${deck.battlefields.length} su ${BATTLEFIELDS_REQUIRED} (duello 1 contro 1).`,
    })
  }
  return issues
}

// ---------------------------------------------------------------------------
// Aiuti per i suggerimenti

/** Una carta che si può mettere nel mazzo principale di questa Legend (103.2, 103.3). */
function legalMain(c: Card, identity: Domain[], tag: string | null) {
  if (!isMainDeckCard(c) || isToken(c)) return false
  if (!fitsIdentity(c, identity)) return false
  return !isSignature(c) || (!!tag && c.tags.includes(tag))
}

function namesIn(deck: Deck, db: CardDb) {
  const m = new Map<string, number>()
  for (const [id, q] of Object.entries(deck.main)) {
    const c = db.byId.get(id)
    if (c) m.set(c.name, (m.get(c.name) ?? 0) + q)
  }
  return m
}

function ownedNames(db: CardDb, owned: Record<string, number>) {
  const m = new Map<string, number>()
  for (const [id, q] of Object.entries(owned)) {
    const c = db.byId.get(id)
    if (c) m.set(c.name, (m.get(c.name) ?? 0) + q)
  }
  return m
}

/**
 * Carte del mazzo tra cui scegliere quella da togliere: prima quelle non legali con questa Legend,
 * poi le meno usate nelle liste di torneo ben piazzate della stessa Legend (se ci sono dati), a
 * parità quelle che non possiedi. Il campione scelto resta sempre con almeno una copia (103.3.a).
 */
export function replaceOptions(
  deck: Deck,
  db: CardDb,
  owned: Record<string, number> = {},
  meta?: MetaData | null,
): { card: Card; qty: number; notes: string[]; share?: number }[] {
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  if (!legend) return []
  const tag = legendChampionTag(legend, db)
  const m = meta ? legendMeta(deck, db, meta) : null
  const have = ownedNames(db, owned)
  const need = namesIn(deck, db)
  const out: { card: Card; qty: number; notes: string[]; share?: number; rank: number; missing: boolean }[] = []
  for (const [id, q] of Object.entries(deck.main)) {
    const c = db.byId.get(id)
    if (!c || (id === deck.championId && q <= 1)) continue
    const notes: string[] = []
    const share = m ? (m.cards[c.name]?.share ?? 0) : undefined
    const illegal = !legalMain(c, legend.domains, tag)
    const missing = (have.get(c.name) ?? 0) < (need.get(c.name) ?? 0)
    if (illegal) notes.push('Non è legale con questa Legend')
    if (share !== undefined) notes.push(`In ${Math.round(share * 100)}% delle liste ben piazzate`)
    if (missing) notes.push(`Ne possiedi ${have.get(c.name) ?? 0} su ${need.get(c.name)}`)
    out.push({ card: c, qty: id === deck.championId ? q - 1 : q, notes, share, rank: illegal ? -1 : (share ?? 0), missing })
  }
  return out
    .sort((a, b) => a.rank - b.rank || Number(b.missing) - Number(a.missing) || (a.card.energy ?? 0) - (b.card.energy ?? 0) || a.card.name.localeCompare(b.card.name))
    .map(({ card, qty, notes, share }) => ({ card, qty, notes, share }))
}

// ---------------------------------------------------------------------------
// Carte chiuse nei mazzi posseduti

/**
 * Copie chiuse nei mazzi posseduti e non liberati, per id di stampa. `except`: il mazzo che si sta
 * guardando, le cui carte sono a sua disposizione.
 */
export function lockedCopies(decks: Deck[], except?: string) {
  const out: Record<string, number> = {}
  for (const d of decks) {
    if (!d.addedToCollection || d.released || d.id === except) continue
    for (const [id, q] of Object.entries(d.addedToCollection)) out[id] = (out[id] ?? 0) + q
  }
  return out
}

/** Copie utilizzabili: quelle sfuse, più quelle del mazzo `forDeck` stesso. */
export function availableCopies(owned: Record<string, number>, decks: Deck[], forDeck?: string) {
  const locked = lockedCopies(decks, forDeck)
  const out: Record<string, number> = {}
  for (const [id, q] of Object.entries(owned)) {
    const left = q - (locked[id] ?? 0)
    if (left > 0) out[id] = left
  }
  return out
}


/** In quali mazzi posseduti (non liberati, diversi da `except`) sono chiuse le copie di una carta. */
export function boxesOf(db: CardDb, decks: Deck[], name: string, except?: string) {
  const out: { deck: string; q: number }[] = []
  for (const d of decks) {
    if (!d.addedToCollection || d.released || d.id === except) continue
    const q = Object.entries(d.addedToCollection).reduce((a, [id, n]) => a + (db.byId.get(id)?.name === name ? n : 0), 0)
    if (q > 0) out.push({ deck: d.name, q })
  }
  return out
}

/**
 * Le copie chiuse nella scatola di un mazzo posseduto seguono la sua lista attuale: se togli una carta
 * dal mazzo torna sfusa, se ne metti una sfusa finisce nella scatola. Per ogni carta del mazzo si
 * prendono prima le stesse stampe, poi quelle già nella scatola, poi le altre stampe con lo stesso
 * nome, senza superare le copie possedute e non chiuse in altre scatole. La collezione non cambia.
 */
export function syncBoxes(decks: Deck[], owned: Record<string, number>, db: CardDb): Deck[] {
  let changed = false
  const out = decks.map((d) => ({ ...d }))
  for (const d of out) {
    if (!d.addedToCollection || d.released) continue
    const free = availableCopies(owned, out, d.id)
    const need = new Map<string, { ids: string[]; q: number }>()
    const want = (id: string | null, q: number) => {
      const c = id ? db.byId.get(id) : undefined
      if (!c || q <= 0) return
      const n = need.get(c.name) ?? { ids: [], q: 0 }
      if (!n.ids.includes(c.id)) n.ids.push(c.id)
      n.q += q
      need.set(c.name, n)
    }
    want(d.legendId, 1)
    for (const [id, q] of Object.entries(d.main)) want(id, q)
    for (const [id, q] of Object.entries(d.runes)) want(id, q)
    for (const id of d.battlefields) want(id, 1)
    const box: Record<string, number> = {}
    for (const [name, n] of need) {
      const prints = Object.keys(owned).filter((id) => db.byId.get(id)?.name === name)
      const old = Object.keys(d.addedToCollection).filter((id) => prints.includes(id))
      let left = n.q
      for (const id of new Set([...n.ids, ...old, ...prints])) {
        const q = Math.min(left, (free[id] ?? 0) - (box[id] ?? 0))
        if (q <= 0) continue
        box[id] = (box[id] ?? 0) + q
        left -= q
        if (!left) break
      }
    }
    const before = d.addedToCollection
    if (Object.keys(box).length !== Object.keys(before).length || Object.entries(box).some(([id, q]) => before[id] !== q)) {
      d.addedToCollection = box
      changed = true
    }
  }
  return changed ? out : decks
}

// ---------------------------------------------------------------------------
// Switch dai tornei (public/data/meta.json, da scripts/update_meta.py con i dati di TopDeck.gg)

export interface MetaData {
  source: string
  sourceUrl: string
  days: number
  generatedAt: number
  goodRule: string
  /** Stima delle vittorie attese (scripts/update_meta.py, build_model). */
  model?: { days: number; lists: number; beta: number; kl: number; k: number; best: number }
  legends: Record<
    string,
    {
      lists: number
      good: number
      cards: Record<string, { share: number; copies: number }>
      /** rate: vittorie della Legend; cards: effetto di ogni carta sulle vittorie; games: partite osservate. */
      model?: { rate: number; games: number; cards: Record<string, number> }
    }
  >
}

/** Sotto queste liste ben piazzate gli switch si mostrano lo stesso, ma con l'avviso che le percentuali sono instabili. */
export const META_MIN_GOOD = 10
/** Entra una carta presente in almeno metà delle liste ben piazzate... */
export const META_IN = 0.5
/** ...al posto di una che compare in al massimo una su cinque. */
export const META_OUT = 0.2

export interface MetaSwitch {
  out: Card
  in: Card
  shareIn: number
  shareOut: number
  copiesIn: number
  /** Se le copie libere non bastano: i mazzi posseduti nella cui scatola è chiusa la carta che entra. */
  inBox?: { deck: string; q: number }[]
}

export type MetaResult =
  | { status: 'none' }
  | { status: 'ok'; lists: number; good: number; weak: boolean; switches: MetaSwitch[] }

/**
 * Switch tra carte possedute e carte del mazzo, basati su cosa giocano le liste di torneo ben
 * piazzate della stessa Legend. Non è una regola né una garanzia: dice solo cosa usano i giocatori
 * che vincono più di quanto perdono.
 */
export function metaSwitches(deck: Deck, db: CardDb, owned: Record<string, number>, meta: MetaData, decks: Deck[] = [], limit = 6): MetaResult {
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  const m = legend ? meta.legends[legend.name] : undefined
  if (!legend || !m || m.good === 0) return { status: 'none' }
  const tag = legendChampionTag(legend, db)
  const share = (c: Card) => m.cards[c.name]?.share ?? 0
  const inDeck = namesIn(deck, db)
  const have = ownedNames(db, owned)
  // copie libere: sfuse o del mazzo stesso; le altre sono chiuse nelle scatole di altri mazzi posseduti
  const free = ownedNames(db, availableCopies(owned, decks, deck.id))

  const ins = new Map<string, Card>()
  for (const id of Object.keys(owned)) {
    const c = db.byId.get(id)
    if (!c || (owned[id] ?? 0) <= 0 || !legalMain(c, legend.domains, tag) || share(c) < META_IN) continue
    if ((have.get(c.name) ?? 0) - (inDeck.get(c.name) ?? 0) <= 0) continue
    if ((inDeck.get(c.name) ?? 0) >= (isUnique(c) ? 1 : MAX_COPIES)) continue
    if (!ins.has(c.name)) ins.set(c.name, c)
  }
  const outs = new Map<string, Card>()
  for (const [id, q] of Object.entries(deck.main)) {
    const c = db.byId.get(id)
    if (!c || (id === deck.championId && q <= 1) || share(c) > META_OUT) continue
    if (!outs.has(c.name)) outs.set(c.name, c)
  }
  const pairs: MetaSwitch[] = []
  for (const o of outs.values())
    for (const i of ins.values()) {
      const boxed = (free.get(i.name) ?? 0) - (inDeck.get(i.name) ?? 0) <= 0
      pairs.push({ out: o, in: i, shareIn: share(i), shareOut: share(o), copiesIn: m.cards[i.name].copies, inBox: boxed ? boxesOf(db, decks, i.name, deck.id) : undefined })
    }
  // Prima le carte più giocate che entrano al posto delle meno giocate (a parità, quelle libere); ogni carta una volta sola
  pairs.sort((a, b) => b.shareIn - b.shareOut - (a.shareIn - a.shareOut) || Number(!!a.inBox) - Number(!!b.inBox) || (a.out.energy ?? 0) - (b.out.energy ?? 0))
  const usedOut = new Set<string>()
  const usedIn = new Set<string>()
  const switches: MetaSwitch[] = []
  for (const p of pairs) {
    if (usedOut.has(p.out.name) || usedIn.has(p.in.name)) continue
    usedOut.add(p.out.name)
    usedIn.add(p.in.name)
    switches.push(p)
    if (switches.length >= limit) break
  }
  return { status: 'ok', lists: m.lists, good: m.good, weak: m.good < META_MIN_GOOD, switches }
}

/** Statistiche dei tornei per la Legend del mazzo, se ci sono liste ben piazzate. */
export function legendMeta(deck: Deck, db: CardDb, meta: MetaData) {
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  const m = legend ? meta.legends[legend.name] : undefined
  return m && m.good > 0 ? m : null
}

/** Copie tipiche nelle liste ben piazzate: la media arrotondata, entro i limiti di copie (103.3). */
export function typicalCopies(c: Card, avg: number) {
  return Math.min(isUnique(c) ? 1 : MAX_COPIES, Math.max(1, Math.round(avg)))
}

export interface MetaSuggestion {
  card: Card
  /** Quota delle liste ben piazzate che la usano. */
  share: number
  /** Copie che usano di solito. */
  copies: number
  inDeck: number
}

/**
 * Carte da aggiungere secondo le liste di torneo ben piazzate della stessa Legend: quelle usate in
 * almeno una lista su cinque, finché il mazzo ne ha meno delle copie tipiche. Dalle più usate.
 */
export function metaSuggestions(deck: Deck, db: CardDb, meta: MetaData, limit = 30): { good: number; lists: number; weak: boolean; list: MetaSuggestion[] } | null {
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  const m = legendMeta(deck, db, meta)
  if (!legend || !m) return null
  const tag = legendChampionTag(legend, db)
  const inDeck = namesIn(deck, db)
  const list: MetaSuggestion[] = []
  for (const [name, u] of Object.entries(m.cards)) {
    if (u.share < META_OUT) continue
    const prints = db.cards.filter((c) => c.name === name)
    const c = prints.find((x) => isBasePrinting(x)) ?? prints[0]
    if (!c || !legalMain(c, legend.domains, tag)) continue
    const copies = typicalCopies(c, u.copies)
    const have = inDeck.get(name) ?? 0
    if (have >= copies) continue
    list.push({ card: c, share: u.share, copies, inDeck: have })
  }
  list.sort((a, b) => b.share - a.share || a.card.name.localeCompare(b.card.name))
  return { good: m.good, lists: m.lists, weak: m.good < META_MIN_GOOD, list: list.slice(0, limit) }
}

// ---------------------------------------------------------------------------
// Overall: vittorie attese nei tornei recenti, in proporzione al mazzo migliore

/** Sotto queste partite osservate per la Legend la stima è poco affidabile. */
export const OVERALL_MIN_GAMES = 300

export interface Overall {
  /** 1-100: vittorie attese in proporzione al mazzo con la stima più alta dei tornei recenti (= 100). */
  overall: number
  /** Vittorie attese (0-1) e intervallo al 95% dovuto ai dati sulla Legend. */
  expected: number
  low: number
  high: number
  /** Vittorie attese del mazzo di riferimento (overall 100). */
  best: number
  games: number
  weak: boolean
  /** Carte del mazzo che spostano di più la stima, con il loro effetto (in punti di vittorie su 100). */
  top: { name: string; effect: number }[]
}

/**
 * Vittorie attese di un mazzo: tasso della Legend nei tornei recenti più l'effetto medio delle sue
 * carte (quanto vincono in più o in meno le liste che le usano), pesato per le copie.
 */
export function deckOverall(deck: Deck, db: CardDb, meta: MetaData): Overall | null {
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  const m = legend ? meta.legends[legend.name]?.model : undefined
  const g = meta.model
  if (!legend || !m || !g) return null
  const byName = namesIn(deck, db)
  const tot = [...byName.values()].reduce((a, b) => a + b, 0)
  if (!tot) return null
  let impact = 0
  const top: { name: string; effect: number }[] = []
  for (const [name, q] of byName) {
    const e = m.cards[name] ?? 0
    impact += (e * q) / tot
    if (e) top.push({ name, effect: (g.beta * e * q * 100) / tot })
  }
  const expected = Math.min(0.99, Math.max(0.01, m.rate + g.beta * impact))
  const margin = 1.96 * Math.sqrt((m.rate * (1 - m.rate)) / (m.games + g.kl))
  top.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
  return {
    overall: Math.max(1, Math.min(100, Math.round((100 * expected) / g.best))),
    expected,
    low: Math.max(0, expected - margin),
    high: Math.min(1, expected + margin),
    best: g.best,
    games: m.games,
    weak: m.games < OVERALL_MIN_GAMES,
    top: top.slice(0, 6),
  }
}

// ---------------------------------------------------------------------------
// Usabilità delle carte: presenza nelle liste di torneo ben piazzate

export interface CardUsage {
  /** Quota delle liste ben piazzate che la usano, tra quelle delle Legend che possono giocarla. */
  share: number
  /** Liste ben piazzate che la usano e liste in cui potrebbe stare. */
  used: number
  possible: number
}

/**
 * Usabilità di ogni carta del mazzo principale, per nome. Il denominatore conta solo le liste di
 * Legend con i domini (e per le Signature il tag) adatti, così una carta non è penalizzata dai mazzi
 * in cui non può stare per regola (103.2.b, 103.3.d.2).
 */
export function cardUsage(db: CardDb, meta: MetaData): Map<string, CardUsage> {
  const legends: { domains: Domain[]; tag: string | null; good: number; cards: Record<string, { share: number }> }[] = []
  for (const [name, l] of Object.entries(meta.legends)) {
    if (!l.good) continue
    const card = db.cards.find((c) => c.name === name && isLegend(c))
    if (!card) continue
    legends.push({ domains: card.domains, tag: legendChampionTag(card, db), good: l.good, cards: l.cards })
  }
  const out = new Map<string, CardUsage>()
  for (const c of db.cards) {
    if (out.has(c.name) || !isMainDeckCard(c) || isToken(c)) continue
    let used = 0
    let possible = 0
    for (const l of legends) {
      if (!fitsIdentity(c, l.domains) || (isSignature(c) && (!l.tag || !c.tags.includes(l.tag)))) continue
      possible += l.good
      used += (l.cards[c.name]?.share ?? 0) * l.good
    }
    if (possible > 0) out.set(c.name, { share: used / possible, used: Math.round(used), possible })
  }
  return out
}

// ---------------------------------------------------------------------------
// Mazzi importati dal file Excel iniziale (public/data/decks.json)

interface PresetDeck {
  name: string
  cards: { section: string; card_id: string | null; qty: number }[]
}

export function presetToDeck(p: PresetDeck, db: CardDb): Deck {
  const deck: Deck = {
    id: `preset-${p.name.toLowerCase()}`,
    name: p.name,
    legendId: null,
    championId: null,
    main: {},
    runes: {},
    battlefields: [],
    preset: true,
    updatedAt: 0,
  }
  for (const e of p.cards) {
    if (!e.card_id) continue
    if (e.section === 'legend') deck.legendId = e.card_id
    else if (e.section === 'battlefield') deck.battlefields.push(e.card_id)
    else if (e.section === 'rune') deck.runes[e.card_id] = (deck.runes[e.card_id] ?? 0) + e.qty
    else deck.main[e.card_id] = (deck.main[e.card_id] ?? 0) + e.qty
  }
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  const tag = legend ? legendChampionTag(legend, db) : null
  const firstChampion = p.cards.find((e) => e.section === 'champion' && e.card_id && db.byId.get(e.card_id)?.tags.includes(tag ?? ''))
  deck.championId = firstChampion?.card_id ?? null
  return deck
}

export function emptyDeck(name: string): Deck {
  return {
    id: `deck-${Date.now().toString(36)}`,
    name,
    legendId: null,
    championId: null,
    main: {},
    runes: {},
    battlefields: [],
    updatedAt: Date.now(),
  }
}
