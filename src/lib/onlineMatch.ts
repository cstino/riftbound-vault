// Partita online tra due account (tabelle matches e match_moves, vedi supabase/schema.sql).
// Ogni dispositivo fa girare il motore completo con lo stesso seme; online passano solo le risposte
// alle decisioni. Ogni risposta, anche le proprie rilette dopo un ricaricamento, passa da
// validAnswer e dal confronto dell'impronta dello stato: una mossa fuori regolamento o una
// divergenza fermano la partita invece di essere accettate.
import { supabase } from './supabase'
import type { CardDb } from './data'
import type { Deck } from './types'
import { validateDeck } from './deck'
import { Match, deckCoverage, deckToSpec } from './game'
import { other } from './game/engine'
import { combineSeeds, commitSeed, stateHash, validAnswer } from './game/online'
import type { Answer, PID } from './game/types'

export interface MatchRow {
  id: string
  code: string
  host: string
  host_name: string
  host_deck: Deck
  host_bf: number | null
  host_commit: string
  host_seed: number | null
  host_salt: string | null
  guest: string | null
  guest_name: string | null
  guest_deck: Deck | null
  guest_bf: number | null
  guest_seed: number | null
  status: 'waiting' | 'joined' | 'playing' | 'over'
  created_at: string
}

export interface MoveRow {
  match_id: string
  seq: number
  user_id: string
  kind: 'answer' | 'resign'
  answer: Answer
  hash: string | null
}

/** Solo i campi che servono a costruire il mazzo (niente collezione, niente scatole). */
export const deckForMatch = (d: Deck): Deck => ({
  id: d.id,
  name: d.name,
  legendId: d.legendId,
  championId: d.championId,
  main: d.main,
  runes: d.runes,
  battlefields: d.battlefields,
  updatedAt: 0,
})

/** Problemi che impediscono di usare un mazzo online: regole di costruzione e carte nel motore. */
export function deckProblems(d: Deck, db: CardDb): string[] {
  const out = validateDeck(d, db)
    .filter((i) => i.level === 'error')
    .map((i) => `${i.text} (${i.rule})`)
  const cov = deckCoverage(d, db)
  if (!cov.playable) out.push(cov.missing.length ? `Carte non ancora nel motore: ${cov.missing.join(', ')}.` : 'Mazzo incompleto.')
  return out
}

const randU32 = () => crypto.getRandomValues(new Uint32Array(1))[0]
const randHex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('')
/** Codice da dettare a voce: niente 0/O e 1/I. */
const newCode = () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return [...crypto.getRandomValues(new Uint8Array(6))].map((b) => abc[b % abc.length]).join('')
}
const secretKey = (id: string) => `rift-online-seed:${id}`

export async function createMatch(deck: Deck, bf: number | null, name: string): Promise<MatchRow> {
  const seed = randU32()
  const salt = randHex(16)
  const commit = await commitSeed(seed, salt)
  for (let i = 0; i < 5; i++) {
    const { data, error } = await supabase!
      .from('matches')
      .insert({ code: newCode(), host_name: name, host_deck: deckForMatch(deck), host_bf: bf, host_commit: commit })
      .select()
      .single()
    if (error?.code === '23505') continue // codice già usato: se ne prova un altro
    if (error) throw new Error(error.message)
    // il seme resta su questo dispositivo finché l'avversario non ha mandato il suo
    localStorage.setItem(secretKey(data.id), JSON.stringify({ seed, salt }))
    return data as MatchRow
  }
  throw new Error('Non riesco a creare un codice libero, riprova.')
}

export async function joinMatch(code: string, deck: Deck, bf: number | null, name: string, userId: string): Promise<MatchRow> {
  const { data: found, error } = await supabase!.from('matches').select().eq('code', code.trim().toUpperCase()).eq('status', 'waiting').maybeSingle()
  if (error) throw new Error(error.message)
  if (!found) throw new Error('Nessuna partita in attesa con questo codice.')
  if (found.host === userId) throw new Error('È la tua partita: aspetta che entri l’avversario.')
  const { data, error: e2 } = await supabase!
    .from('matches')
    .update({ guest: userId, guest_name: name, guest_deck: deckForMatch(deck), guest_bf: bf, guest_seed: randU32(), status: 'joined' })
    .eq('id', found.id)
    .eq('status', 'waiting')
    .select()
    .maybeSingle()
  if (e2) throw new Error(e2.message)
  if (!data) throw new Error('Qualcun altro è entrato prima di te.')
  return data as MatchRow
}

/** L'host rivela il suo seme (il database controlla che corrisponda all'impronta). */
async function reveal(row: MatchRow) {
  const raw = localStorage.getItem(secretKey(row.id))
  if (!raw) throw new Error('Il seme di questa partita non è su questo dispositivo: va creata di nuovo.')
  const { seed, salt } = JSON.parse(raw) as { seed: number; salt: string }
  const { error } = await supabase!.from('matches').update({ host_seed: seed, host_salt: salt, status: 'playing' }).eq('id', row.id).eq('status', 'joined')
  if (error) throw new Error(error.message)
}

export async function cancelMatch(id: string) {
  await supabase!.from('matches').update({ status: 'over' }).eq('id', id)
}

export async function myMatches(userId: string): Promise<MatchRow[]> {
  const { data } = await supabase!
    .from('matches')
    .select()
    .or(`host.eq.${userId},guest.eq.${userId}`)
    .in('status', ['waiting', 'joined', 'playing'])
    .order('created_at', { ascending: false })
    .limit(10)
  return (data ?? []) as MatchRow[]
}

export type OnlineState =
  | { kind: 'loading' }
  | { kind: 'waiting'; row: MatchRow }
  | { kind: 'playing'; row: MatchRow }
  | { kind: 'error'; text: string }

/**
 * Collega la partita `id` al motore. `onChange` viene chiamata a ogni novità (mossa ricevuta,
 * avversario entrato, errore). Restituisce i comandi per rispondere e chiudere il collegamento.
 */
export class OnlineGame {
  row: MatchRow | null = null
  match: Match | null = null
  me: PID = 0
  /** Mosse applicate (= numero della prossima mossa). */
  applied = 0
  /** Chi ha abbandonato, se qualcuno l'ha fatto. */
  resigned: PID | null = null
  error: string | null = null
  /** Mosse fatte qui e non ancora salvate online. */
  private outbox: MoveRow[] = []
  private channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
  private timer: ReturnType<typeof setInterval> | undefined
  private busy = false
  private closed = false
  readonly id: string
  private readonly userId: string
  private readonly db: CardDb
  private readonly onChange: () => void

  constructor(id: string, userId: string, db: CardDb, onChange: () => void) {
    this.id = id
    this.userId = userId
    this.db = db
    this.onChange = onChange
  }

  get state(): OnlineState {
    if (this.error) return { kind: 'error', text: this.error }
    if (!this.row) return { kind: 'loading' }
    if (!this.match) return { kind: 'waiting', row: this.row }
    return { kind: 'playing', row: this.row }
  }

  get oppName() {
    const r = this.row
    return (this.me === 0 ? r?.guest_name : r?.host_name) ?? 'Avversario'
  }

  get myTurn() {
    const d = this.match?.pending
    return !!d && d.player === this.me && this.resigned === null && this.match!.g.winner === null
  }

  start() {
    this.channel = supabase!
      .channel(`match-${this.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${this.id}` }, () => void this.sync())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_moves', filter: `match_id=eq.${this.id}` }, () => void this.sync())
      .subscribe()
    // rete di sicurezza se il tempo reale non arriva (telefono in sospensione, rete che cambia)
    this.timer = setInterval(() => void this.sync(), 4000)
    void this.sync()
  }

  stop() {
    this.closed = true
    clearInterval(this.timer)
    if (this.channel) void supabase!.removeChannel(this.channel)
  }

  /** Ferma la partita; `close` la chiude anche online (mossa illegale o divergenza). */
  private fail(text: string, close = false) {
    this.error = text
    if (close) void cancelMatch(this.id)
    this.onChange()
  }

  /** Legge la partita e le mosse nuove, e le applica in ordine controllandole. */
  async sync() {
    if (this.busy || this.closed || this.error) return
    this.busy = true
    try {
      await this.flush()
      const { data: row, error } = await supabase!.from('matches').select().eq('id', this.id).maybeSingle()
      if (error) return
      if (!row) return this.fail('Partita non trovata.')
      this.row = row as MatchRow
      this.me = this.row.host === this.userId ? 0 : 1
      if (this.row.guest !== this.userId && this.row.host !== this.userId) return this.fail('Non sei un giocatore di questa partita.')
      if (this.row.status === 'joined' && this.me === 0) await reveal(this.row)
      if (!this.match && this.row.host_seed !== null && this.row.guest_seed !== null) await this.build()
      if (this.match) {
        const { data: moves } = await supabase!.from('match_moves').select().eq('match_id', this.id).gte('seq', this.applied).order('seq')
        for (const mv of (moves ?? []) as MoveRow[]) if (!this.apply(mv)) return
        if ((this.match.g.winner !== null || this.resigned !== null) && this.row.status !== 'over') await cancelMatch(this.id)
      }
      this.onChange()
    } catch (e) {
      // offline o errore momentaneo: si riprova al giro dopo
      if (!navigator.onLine) return
      this.fail(String(e instanceof Error ? e.message : e))
    } finally {
      this.busy = false
    }
  }

  /** Prepara il motore: controlla l'impronta del seme e i due mazzi prima di iniziare. */
  private async build() {
    const r = this.row!
    if ((await commitSeed(r.host_seed!, r.host_salt!)) !== r.host_commit) return this.fail('Il seme rivelato non corrisponde all’impronta: partita annullata.', true)
    const decks = [r.host_deck, r.guest_deck!]
    for (const [i, d] of decks.entries()) {
      const bad = deckProblems(d, this.db)
      if (bad.length) return this.fail(`Il mazzo di ${i === 0 ? r.host_name : r.guest_name} non è valido: ${bad.join(' ')}`, true)
      const bf = i === 0 ? r.host_bf : r.guest_bf
      if (bf !== null && !(Number.isInteger(bf) && bf >= 0 && bf < d.battlefields.length)) return this.fail('Campo di battaglia scelto non valido.', true)
    }
    this.match = new Match(
      [deckToSpec(decks[0], this.db), deckToSpec(decks[1], this.db)],
      [r.host_name, r.guest_name ?? 'Ospite'],
      this.me,
      combineSeeds(r.host_seed!, r.guest_seed!),
      // campo scelto (488.5) o estratto a caso (487.5), per ciascun giocatore
      [r.host_bf, r.guest_bf],
    )
    this.match.next()
  }

  /** Applica una mossa letta online; false se la partita va fermata. */
  private apply(mv: MoveRow): boolean {
    if (mv.seq !== this.applied) return true // già applicata (mossa fatta qui)
    const m = this.match!
    const by: PID = mv.user_id === this.row!.host ? 0 : 1
    if (this.resigned !== null) return true
    if (mv.kind === 'resign') {
      this.resigned = by
      m.g.winner = other(by) // chi abbandona perde
      this.applied++
      return true
    }
    const d = m.pending
    if (!d || m.g.winner !== null) {
      this.fail(`Mossa ${mv.seq} dopo la fine della partita: partita fermata.`, true)
      return false
    }
    if (d.player !== by || !validAnswer(d, mv.answer)) {
      this.fail(`Mossa ${mv.seq} fuori regolamento da parte di ${by === 0 ? this.row!.host_name : this.row!.guest_name}: partita fermata.`, true)
      return false
    }
    m.next(mv.answer)
    this.applied++
    if (mv.hash && stateHash(m.g) !== mv.hash) {
      this.fail('I due dispositivi non vedono più la stessa partita (impronte diverse): partita fermata.', true)
      return false
    }
    return true
  }

  /** Risposta del giocatore di questo dispositivo: si applica subito e si salva online. */
  answer(a: Answer) {
    const m = this.match
    const d = m?.pending
    if (!m || !d || !this.myTurn || !validAnswer(d, a)) return
    m.next(a)
    this.outbox.push({ match_id: this.id, seq: this.applied, user_id: this.userId, kind: 'answer', answer: a, hash: stateHash(m.g) })
    this.applied++
    this.onChange()
    void this.flush()
  }

  async resign() {
    if (!this.match || this.resigned !== null || this.match.g.winner !== null) return
    this.resigned = this.me
    this.match.g.winner = other(this.me)
    this.outbox.push({ match_id: this.id, seq: this.applied, user_id: this.userId, kind: 'resign', answer: null, hash: null })
    this.applied++
    this.onChange()
    await this.flush()
    await cancelMatch(this.id)
  }

  get winner(): PID | null {
    if (this.resigned !== null) return other(this.resigned)
    return this.match?.g.winner ?? null
  }

  /** Invia le mosse in attesa, in ordine (un solo invio alla volta). */
  private flushing: Promise<void> | null = null
  private flush() {
    this.flushing ??= this.send().finally(() => (this.flushing = null))
    return this.flushing
  }

  private async send() {
    while (this.outbox.length && !this.error) {
      const mv = this.outbox[0]
      const { error } = await supabase!.from('match_moves').insert({ match_id: mv.match_id, seq: mv.seq, kind: mv.kind, answer: mv.answer, hash: mv.hash })
      if (error?.code === '23505') {
        // già registrata: va bene solo se è proprio questa mossa (invio ripetuto dopo un errore di rete)
        const { data } = await supabase!.from('match_moves').select().eq('match_id', mv.match_id).eq('seq', mv.seq).maybeSingle()
        const same = data && data.user_id === this.userId && data.kind === mv.kind && data.hash === mv.hash
        if (!same) return this.fail(`La mossa ${mv.seq} era già stata registrata da altri: partita fermata.`, true)
      } else if (error) return // rete: si riprova
      this.outbox.shift()
      this.onChange()
    }
  }

  get pendingSend() {
    return this.outbox.length > 0
  }
}
