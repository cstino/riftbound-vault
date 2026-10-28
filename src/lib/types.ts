export type Domain = 'Fury' | 'Calm' | 'Mind' | 'Body' | 'Chaos' | 'Order'

export const DOMAINS: Domain[] = ['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order']

export interface Card {
  id: string
  code: string
  set: string
  set_name: string
  number: string
  set_size: number | null
  name: string
  short_name: string
  type: string
  rarity: string | null
  domains: Domain[]
  energy: number | null
  power: number | null
  might: number | null
  tags: string[]
  text: string | null
  artist: string | null
  alt_art: boolean
  signature: boolean
  image_url: string
  image_file: string
}

export interface Deck {
  id: string
  name: string
  legendId: string | null
  championId: string | null
  /** Carte del mazzo principale (campione scelto incluso), per id di stampa. */
  main: Record<string, number>
  runes: Record<string, number>
  battlefields: string[]
  /** Mazzi importati dal file iniziale: si possono duplicare ma non vanno persi. */
  preset?: boolean
  /** Copie aggiunte alla collezione con "Ho questo mazzo", per poterle togliere esattamente. */
  addedToCollection?: Record<string, number>
  /**
   * Le carte di un mazzo posseduto restano nella sua scatola: non si possono usare in altri mazzi
   * finché non vengono liberate (true).
   */
  released?: boolean
  updatedAt: number
}

export interface RuleEntry {
  n: string
  t: string
}
