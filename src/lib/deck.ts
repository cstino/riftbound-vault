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
import { GLOSSARY, glossaryIdForTerm } from '../data/glossary'

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
    } else if (qty > MAX_COPIES) {
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
// Suggerimenti
//
// Non sono regole: confrontano testo e tag delle carte con quelli del mazzo e spiegano sempre il motivo.

/** Parole chiave (voci del glossario) presenti nel testo di una carta. */
export function keywordsOf(c: Card): string[] {
  const out = new Set<string>()
  for (const m of (c.text ?? '').matchAll(/\[([^\]]+)\]/g)) {
    const id = glossaryIdForTerm(m[1])
    // Empowered dipende da Empower: per i temi del mazzo contano come una cosa sola.
    // Action e Reaction dicono solo quando si gioca la carta: non sono un tema.
    if (id && id !== 'action' && id !== 'reaction') out.add(id === 'empowered' ? 'empower' : id)
  }
  return [...out]
}

const plain = (c: Card) => (c.text ?? '').replace(/<[^>]+>/g, ' ').replace(/\([^)]*\)/g, ' ')

/** Tag citati nel testo (es. "your Mechs"), escluse le spiegazioni tra parentesi. */
function tagsMentioned(c: Card, db: CardDb) {
  const text = plain(c)
  return [...db.tags].filter((t) => t.length > 2 && new RegExp(`\\b${t}s?\\b`).test(text))
}

export interface Theme {
  key: string
  label: string
  kind: 'keyword' | 'tag'
  weight: number
}

/** Temi del mazzo: parole chiave e tag che ricorrono nella Legend, nel campione e nelle carte scelte. */
export function deckThemes(deck: Deck, db: CardDb): Theme[] {
  const counts = new Map<string, Theme>()
  const bump = (key: string, label: string, kind: Theme['kind'], w: number) => {
    const t = counts.get(key) ?? { key, label, kind, weight: 0 }
    t.weight += w
    counts.set(key, t)
  }
  const core = [deck.legendId, deck.championId].map((id) => (id ? db.byId.get(id) : undefined))
  const inDeck = Object.entries(deck.main).map(([id, q]) => [db.byId.get(id), q] as const)
  for (const c of core) {
    if (!c) continue
    for (const k of keywordsOf(c)) bump(`k:${k}`, GLOSSARY.find((g) => g.id === k)!.term, 'keyword', 3)
    for (const t of tagsMentioned(c, db)) bump(`t:${t}`, t, 'tag', 3)
  }
  for (const [c, q] of inDeck) {
    if (!c) continue
    for (const k of keywordsOf(c)) bump(`k:${k}`, GLOSSARY.find((g) => g.id === k)!.term, 'keyword', q * 0.5)
    for (const t of tagsMentioned(c, db)) bump(`t:${t}`, t, 'tag', q)
  }
  return [...counts.values()].filter((t) => t.weight >= 1.5).sort((a, b) => b.weight - a.weight)
}

export interface Suggestion {
  card: Card
  score: number
  reasons: string[]
}

interface FitCtx {
  tag: string | null
  themes: Theme[]
  focus: Set<string>
}

/**
 * Quanto una carta è legata al mazzo (euristica, non una regola): tag del campione e temi
 * ricorrenti di parole chiave e tag. Le ragioni spiegano il punteggio.
 */
function fitOf(c: Card, db: CardDb, ctx: FitCtx): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []
  if (ctx.tag && c.tags.includes(ctx.tag)) {
    score += isSignature(c) ? 6 : 4
    reasons.push(isSignature(c) ? `Signature di ${ctx.tag}` : `Ha il tag ${ctx.tag}, come la tua Legend`)
  }
  const kws = keywordsOf(c)
  const ctags = new Set([...c.tags, ...tagsMentioned(c, db)])
  for (const t of ctx.themes) {
    const hit = t.kind === 'keyword' ? kws.includes(t.key.slice(2)) : ctags.has(t.label)
    if (!hit) continue
    const boost = ctx.focus.has(t.key) ? 3 : 1
    score += Math.min(t.weight, 6) * 0.6 * boost
    reasons.push(t.kind === 'keyword' ? `Usa ${t.label}, un tema del mazzo` : `Legata al tema ${t.label}`)
  }
  for (const f of ctx.focus) {
    if (ctx.themes.some((t) => t.key === f)) continue
    const hit = f.startsWith('k:') ? kws.includes(f.slice(2)) : ctags.has(f.slice(2))
    if (hit) {
      score += 4
      reasons.push(`Tema scelto da te: ${f.startsWith('k:') ? GLOSSARY.find((g) => g.id === f.slice(2))?.term : f.slice(2)}`)
    }
  }
  return { score, reasons }
}

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

export function suggestCards(
  deck: Deck,
  db: CardDb,
  opts: { focus?: string[]; owned?: Record<string, number>; onlyOwned?: boolean; limit?: number } = {},
): Suggestion[] {
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  if (!legend) return []
  const identity = legend.domains
  const tag = legendChampionTag(legend, db)
  const ctx: FitCtx = { tag, themes: deckThemes(deck, db), focus: new Set(opts.focus ?? []) }
  const inDeckNames = namesIn(deck, db)
  // Curva dei costi in Energia del mazzo attuale
  const curve = new Map<number, number>()
  for (const [id, q] of Object.entries(deck.main)) {
    const e = db.byId.get(id)?.energy
    if (e != null) curve.set(Math.min(e, 7), (curve.get(Math.min(e, 7)) ?? 0) + q)
  }
  const deckSize = countOf(deck.main)
  const ownedByName = ownedNames(db, opts.owned ?? {})

  const seen = new Set<string>()
  const out: Suggestion[] = []
  for (const c of db.cards) {
    if (!isBasePrinting(c) || seen.has(c.name) || !legalMain(c, identity, tag)) continue
    if (isChampionUnit(c) && c.id === deck.championId) continue
    const have = inDeckNames.get(c.name) ?? 0
    if (have >= (isUnique(c) ? 1 : MAX_COPIES)) continue
    const ownedQty = ownedByName.get(c.name) ?? 0
    if (opts.onlyOwned && ownedQty === 0) continue
    seen.add(c.name)

    let { score, reasons } = fitOf(c, db, ctx)
    if (c.energy != null && deckSize >= 10) {
      const bucket = Math.min(c.energy, 7)
      const share = (curve.get(bucket) ?? 0) / deckSize
      if (bucket >= 1 && bucket <= 4 && share < 0.1) {
        score += 1
        reasons = [...reasons, `Nel mazzo hai poche carte da ${bucket} Energia`]
      }
    }
    if (ownedQty > 0) {
      score += 0.75
      reasons = [...reasons, `Ne possiedi ${ownedQty}`]
    }
    if (score > 0.8) out.push({ card: c, score, reasons })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 40)
}

/**
 * Carte del mazzo tra cui scegliere quella da togliere. Solo fatti, nessun giudizio sulla forza:
 * prima quelle non legali con questa Legend, poi quelle di cui non possiedi abbastanza copie.
 * Il campione scelto resta sempre con almeno una copia (103.3.a).
 */
export function replaceOptions(deck: Deck, db: CardDb, owned: Record<string, number> = {}): { card: Card; qty: number; notes: string[] }[] {
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  if (!legend) return []
  const tag = legendChampionTag(legend, db)
  const have = ownedNames(db, owned)
  const need = namesIn(deck, db)
  const out: { card: Card; qty: number; notes: string[]; rank: number }[] = []
  for (const [id, q] of Object.entries(deck.main)) {
    const c = db.byId.get(id)
    if (!c || (id === deck.championId && q <= 1)) continue
    const notes: string[] = []
    let rank = 2
    if (!legalMain(c, legend.domains, tag)) {
      notes.push('Non è legale con questa Legend')
      rank = 0
    } else if ((have.get(c.name) ?? 0) < (need.get(c.name) ?? 0)) {
      notes.push(`Ne possiedi ${have.get(c.name) ?? 0} su ${need.get(c.name)}`)
      rank = 1
    }
    out.push({ card: c, qty: id === deck.championId ? q - 1 : q, notes, rank })
  }
  return out
    .sort((a, b) => a.rank - b.rank || (a.card.energy ?? 0) - (b.card.energy ?? 0) || a.card.name.localeCompare(b.card.name))
    .map(({ card, qty, notes }) => ({ card, qty, notes }))
}

// ---------------------------------------------------------------------------
// Switch dai tornei (public/data/meta.json, da scripts/update_meta.py con i dati di TopDeck.gg)

export interface MetaData {
  source: string
  sourceUrl: string
  days: number
  generatedAt: number
  goodRule: string
  legends: Record<string, { lists: number; good: number; cards: Record<string, { share: number; copies: number }> }>
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
}

export type MetaResult =
  | { status: 'none' }
  | { status: 'ok'; lists: number; good: number; weak: boolean; switches: MetaSwitch[] }

/**
 * Switch tra carte possedute e carte del mazzo, basati su cosa giocano le liste di torneo ben
 * piazzate della stessa Legend. Non è una regola né una garanzia: dice solo cosa usano i giocatori
 * che vincono più di quanto perdono.
 */
export function metaSwitches(deck: Deck, db: CardDb, owned: Record<string, number>, meta: MetaData, limit = 6): MetaResult {
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  const m = legend ? meta.legends[legend.name] : undefined
  if (!legend || !m || m.good === 0) return { status: 'none' }
  const tag = legendChampionTag(legend, db)
  const share = (c: Card) => m.cards[c.name]?.share ?? 0
  const inDeck = namesIn(deck, db)
  const have = ownedNames(db, owned)

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
    for (const i of ins.values()) pairs.push({ out: o, in: i, shareIn: share(i), shareOut: share(o), copiesIn: m.cards[i.name].copies })
  // Prima le carte più giocate che entrano al posto delle meno giocate; ogni carta una volta sola
  pairs.sort((a, b) => b.shareIn - b.shareOut - (a.shareIn - a.shareOut) || (a.out.energy ?? 0) - (b.out.energy ?? 0))
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
