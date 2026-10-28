import type { Card, RuleEntry } from './types'

export const BASE = import.meta.env.BASE_URL

export const asset = (path: string) => `${BASE}${path}`.replace(/\/{2,}/g, '/')

/**
 * Immagine della carta dal CDN ufficiale di Riot, ridimensionata dal CDN stesso.
 * Le immagini non fanno parte del deploy (pesavano ~66 MB a ogni pubblicazione);
 * la copia in images/ nel repository è solo un archivio.
 */
export const cardImage = (c: { image_url: string }) => `${c.image_url}?w=500&fm=webp&q=82`

export const SET_ORDER = ['OGN', 'OGS', 'SFD', 'UNL', 'VEN', 'RAD']

export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase']

export interface CardDb {
  cards: Card[]
  byId: Map<string, Card>
  /** Nomi dei campioni (per riconoscere il tag campione di una Legend). */
  champions: Set<string>
  /** Tutti i tag che compaiono sulle carte. */
  tags: Set<string>
}

export async function loadCards(): Promise<CardDb> {
  const res = await fetch(asset('data/cards.json'))
  const cards: Card[] = await res.json()
  const byId = new Map(cards.map((c) => [c.id, c]))
  const champions = new Set(cards.filter((c) => c.type === 'Champion Unit').map((c) => c.short_name))
  const tags = new Set(cards.flatMap((c) => c.tags))
  return { cards, byId, champions, tags }
}

let rulesPromise: Promise<{ updated: string; rules: RuleEntry[] }> | null = null

export function loadRules() {
  rulesPromise ??= fetch(asset('data/rules.json')).then((r) => r.json())
  return rulesPromise
}

/** Restituisce la regola indicata e tutte le sue sottoregole (es. "811" → 811, 811.1, 811.1.a ...). */
export function rulesUnder(rules: RuleEntry[], ref: string) {
  return rules.filter((r) => r.n === ref || r.n.startsWith(`${ref}.`))
}

export const isLegend = (c: Card) => /\bLegend\b/.test(c.type)
export const isBattlefield = (c: Card) => /\bBattlefield\b/.test(c.type)
export const isRune = (c: Card) => /\bRune\b/.test(c.type)
export const isToken = (c: Card) => /\bToken\b/.test(c.type)
export const isSignature = (c: Card) => /\bSignature\b/.test(c.type)
export const isChampionUnit = (c: Card) => c.type === 'Champion Unit'
export const isMainDeckCard = (c: Card) =>
  !isLegend(c) && !isBattlefield(c) && !isRune(c) && !isToken(c) && c.type !== ''

/** Le stampe "base" escludono alt art, signature numerate e overnumbered. */
export const isBasePrinting = (c: Card) =>
  !c.alt_art && !c.signature && (c.set_size == null || parseInt(c.number, 10) <= c.set_size)

export function legendChampionTag(legend: Card, db: CardDb) {
  return legend.tags.find((t) => db.champions.has(t)) ?? null
}

export function rarityRank(c: Card) {
  const i = RARITY_ORDER.indexOf(c.rarity ?? '')
  return i < 0 ? -1 : i
}

export function sortCards(a: Card, b: Card) {
  return (
    SET_ORDER.indexOf(a.set) - SET_ORDER.indexOf(b.set) ||
    a.number.localeCompare(b.number, undefined, { numeric: true })
  )
}
