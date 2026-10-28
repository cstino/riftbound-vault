// Riconoscimento di una lista di carte incollata (es. la lista ufficiale di un mazzo).
// Formati accettati per riga: "3 Shadow Assassin", "3x Shadow Assassin", "Shadow Assassin x3",
// "Shadow Assassin" (= 1). Le righe di intestazione ("Main Deck:", "Legend:") vengono ignorate.
import type { Card, Deck } from './types'
import {
  type CardDb,
  isBasePrinting,
  isBattlefield,
  isChampionUnit,
  isLegend,
  isRune,
  legendChampionTag,
  sortCards,
} from './data'

export interface ParsedLine {
  raw: string
  qty: number
  name: string
  card: Card | null
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()

/** Indice nome → stampa base (alt art e signature solo se non c'è altro). */
export function nameIndex(db: CardDb) {
  const idx = new Map<string, Card>()
  const ordered = [...db.cards].sort((a, b) => Number(isBasePrinting(b)) - Number(isBasePrinting(a)) || sortCards(a, b))
  for (const c of ordered) {
    const keys = [c.name, c.short_name]
    // Le Legend sono salvate come "Zed - Master of Shadows": nelle liste spesso c'è solo "Master of Shadows"
    if (c.name.includes(' - ')) keys.push(c.name.split(' - ').slice(1).join(' - '))
    for (const k of keys) {
      const n = norm(k)
      if (n && !idx.has(n)) idx.set(n, c)
    }
  }
  return idx
}

export function parseList(text: string, db: CardDb): ParsedLine[] {
  const idx = nameIndex(db)
  const out: ParsedLine[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim()
    if (!raw || /:\s*$/.test(raw)) continue
    let qty = 1
    let name = raw.replace(/^[-•*]\s*/, '')
    const lead = name.match(/^(\d+)\s*x?\s+(.+)$/i)
    const tail = name.match(/^(.+?)\s+x\s*(\d+)$/i)
    if (lead) [qty, name] = [Number(lead[1]), lead[2]]
    else if (tail) [qty, name] = [Number(tail[2]), tail[1]]
    name = name.trim()
    // Le carte campione nelle liste a volte usano la virgola, a volte il trattino
    const card = idx.get(norm(name)) ?? idx.get(norm(name.replace(/\s+-\s+/, ', '))) ?? null
    out.push({ raw, qty, name, card })
  }
  return out
}

/** Costruisce un mazzo dalle righe riconosciute, smistando Legend, campi e rune. */
export function deckFromLines(lines: ParsedLine[], name: string, db: CardDb): Deck {
  const deck: Deck = {
    id: `deck-${Date.now().toString(36)}`,
    name,
    legendId: null,
    championId: null,
    main: {},
    runes: {},
    battlefields: [],
    updatedAt: Date.now(),
  }
  for (const l of lines) {
    const c = l.card
    if (!c) continue
    if (isLegend(c)) deck.legendId = c.id
    else if (isBattlefield(c)) {
      if (!deck.battlefields.includes(c.id)) deck.battlefields.push(c.id)
    } else if (isRune(c)) deck.runes[c.id] = (deck.runes[c.id] ?? 0) + l.qty
    else deck.main[c.id] = (deck.main[c.id] ?? 0) + l.qty
  }
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  const tag = legend ? legendChampionTag(legend, db) : null
  deck.championId =
    Object.keys(deck.main).find((id) => {
      const c = db.byId.get(id)
      return c && isChampionUnit(c) && !!tag && c.tags.includes(tag)
    }) ?? null
  return deck
}

/** Copie da aggiungere alla collezione per le righe riconosciute. */
export function linesToCounts(lines: ParsedLine[]) {
  const rec: Record<string, number> = {}
  for (const l of lines) if (l.card) rec[l.card.id] = (rec[l.card.id] ?? 0) + l.qty
  return rec
}
