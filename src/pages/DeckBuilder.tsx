import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useDb } from '../lib/useDb'
import { useVault } from '../lib/store'
import type { Card, Deck } from '../lib/types'
import {
  asset,
  isBasePrinting,
  isBattlefield,
  isChampionUnit,
  isLegend,
  isRune,
  isSignature,
  legendChampionTag,
  sortCards,
} from '../lib/data'
import {
  BATTLEFIELDS_REQUIRED,
  MAIN_MIN,
  RUNES_REQUIRED,
  countOf,
  deckThemes,
  fitsIdentity,
  isUnique,
  MAX_COPIES,
  suggestCards,
  validateDeck,
} from '../lib/deck'
import { DomainIcon, EnergyGlyph, MightGlyph } from '../components/Icons'
import { RuleQuote } from '../components/Explainer'
import { cardParagraphs } from '../components/CardText'
import { ownedByName, ownedCoverage } from './deckUtils'
import './deckBuilder.css'

type Tab = 'mazzo' | 'aggiungi' | 'regole'

/** Una stampa per nome: la base se esiste. */
function uniqueByName(cards: Card[]) {
  const m = new Map<string, Card>()
  for (const c of [...cards].sort((a, b) => Number(isBasePrinting(b)) - Number(isBasePrinting(a)) || sortCards(a, b))) {
    if (!m.has(c.name)) m.set(c.name, c)
  }
  return [...m.values()].sort(sortCards)
}

export function DeckBuilder() {
  const { id } = useParams<{ id: string }>()
  const db = useDb()
  const deck = useVault((s) => s.decks.find((d) => d.id === id))
  const saveDeck = useVault((s) => s.saveDeck)
  const deleteDeck = useVault((s) => s.deleteDeck)
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('mazzo')

  if (!deck) {
    return (
      <div className="empty">
        <p>Questo mazzo non esiste più.</p>
        <Link className="btn btn-small" to="/mazzi" style={{ marginTop: 12 }}>
          Torna ai mazzi
        </Link>
      </div>
    )
  }

  const edit = (fn: (d: Deck) => void) => {
    const next: Deck = structuredClone(deck)
    fn(next)
    saveDeck(next)
  }
  const legend = deck.legendId ? db.byId.get(deck.legendId) : undefined
  const champion = deck.championId ? db.byId.get(deck.championId) : undefined

  return (
    <div className="builder">
      <header className="builder-head">
        <Link to="/mazzi" className="link-more">
          ← Mazzi
        </Link>
        <input
          className="builder-name"
          value={deck.name}
          onChange={(e) => edit((d) => void (d.name = e.target.value))}
          aria-label="Nome del mazzo"
        />
        {legend && (
          <p className="builder-identity">
            {legend.domains.map((d) => (
              <DomainIcon key={d} domain={d} size={20} />
            ))}
            <span>{legend.name}</span>
            <button
              type="button"
              className="link-more"
              onClick={() => edit((d) => Object.assign(d, { legendId: null, championId: null }))}
            >
              Cambia Legend
            </button>
          </p>
        )}
      </header>

      {!legend ? (
        <LegendPicker onPick={(c) => edit((d) => setLegend(d, c, db))} />
      ) : !champion ? (
        <ChampionPicker legend={legend} onPick={(c) => edit((d) => setChampion(d, c))} />
      ) : (
        <>
          <div className="seg builder-tabs" role="tablist">
            {(
              [
                ['mazzo', 'Mazzo'],
                ['aggiungi', 'Aggiungi'],
                ['regole', 'Regole'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {tab === k && <motion.span layoutId="builder-tab" className="seg-active" />}
                <span>{label}</span>
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              {tab === 'mazzo' && <DeckTab deck={deck} edit={edit} />}
              {tab === 'aggiungi' && <AddTab deck={deck} edit={edit} />}
              {tab === 'regole' && <RulesTab deck={deck} />}
            </motion.div>
          </AnimatePresence>
          <StatusBar deck={deck} onIssues={() => setTab('regole')} />
        </>
      )}

      {!deck.preset && (
        <button
          type="button"
          className="link-more builder-delete"
          onClick={() => {
            if (confirm(`Eliminare il mazzo “${deck.name}”?`)) {
              deleteDeck(deck.id)
              navigate('/mazzi')
            }
          }}
        >
          Elimina mazzo
        </button>
      )}
    </div>
  )
}

function setLegend(d: Deck, legend: Card, db: ReturnType<typeof useDb>) {
  d.legendId = legend.id
  d.championId = null
  // Carte fuori dai nuovi domini restano nel mazzo ma vengono segnalate dal validatore.
  // Rune: 6 + 6 dei due domini come punto di partenza (si possono cambiare).
  const runes = uniqueByName(db.cards.filter((c) => isRune(c) && c.type === 'Basic Rune' && fitsIdentity(c, legend.domains)))
  d.runes = {}
  const per = Math.floor(RUNES_REQUIRED / Math.max(1, runes.length))
  runes.forEach((r, i) => (d.runes[r.id] = per + (i < RUNES_REQUIRED - per * runes.length ? 1 : 0)))
}

function setChampion(d: Deck, champ: Card) {
  if (d.championId && d.championId !== champ.id && d.main[d.championId] === 1) delete d.main[d.championId]
  d.championId = champ.id
  d.main[champ.id] = Math.max(1, d.main[champ.id] ?? 0)
}

// ---------------------------------------------------------------------------

function PickerGrid({ cards, onPick, ownedNames }: { cards: Card[]; onPick: (c: Card) => void; ownedNames: Map<string, number> }) {
  return (
    <div className="card-grid picker-grid">
      {cards.map((c, i) => (
        <motion.button
          key={c.id}
          type="button"
          className="picker-item"
          onClick={() => onPick(c)}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i, 12) * 0.03 }}
          whileTap={{ scale: 0.96 }}
        >
          <img src={asset(c.image_file)} alt={c.name} loading="lazy" />
          {ownedNames.get(c.name) ? <span className="thumb-qty">×{ownedNames.get(c.name)}</span> : null}
        </motion.button>
      ))}
    </div>
  )
}

function LegendPicker({ onPick }: { onPick: (c: Card) => void }) {
  const db = useDb()
  const owned = useVault((s) => s.owned)
  const names = useMemo(() => ownedByName(db, owned), [db, owned])
  const legends = useMemo(() => uniqueByName(db.cards.filter((c) => isLegend(c) && legendChampionTag(c, db))), [db])
  const mine = legends.filter((l) => names.get(l.name))
  const [onlyMine, setOnlyMine] = useState(mine.length > 0)
  return (
    <section className="section">
      <h2>1. Scegli la Champion Legend</h2>
      <p className="muted picker-help">I suoi due domini decidono quali carte puoi mettere nel mazzo (regola 103.2).</p>
      <div className="chips" style={{ margin: '12px 0 16px' }}>
        <button className="chip" aria-pressed={onlyMine} onClick={() => setOnlyMine(true)}>
          Le mie ({mine.length})
        </button>
        <button className="chip" aria-pressed={!onlyMine} onClick={() => setOnlyMine(false)}>
          Tutte ({legends.length})
        </button>
      </div>
      <PickerGrid cards={onlyMine ? mine : legends} onPick={onPick} ownedNames={names} />
    </section>
  )
}

function ChampionPicker({ legend, onPick }: { legend: Card; onPick: (c: Card) => void }) {
  const db = useDb()
  const owned = useVault((s) => s.owned)
  const names = useMemo(() => ownedByName(db, owned), [db, owned])
  const tag = legendChampionTag(legend, db)
  const champs = useMemo(() => uniqueByName(db.cards.filter((c) => isChampionUnit(c) && tag && c.tags.includes(tag))), [db, tag])
  return (
    <section className="section">
      <h2>2. Scegli il campione</h2>
      <p className="muted picker-help">
        Un’unità campione con il tag {tag}. Inizia la partita nella Champion Zone e conta nelle 40 carte (regola 103.3.a).
      </p>
      <div style={{ height: 14 }} />
      <PickerGrid cards={champs} onPick={onPick} ownedNames={names} />
    </section>
  )
}

// ---------------------------------------------------------------------------

function useOwnedNames() {
  const db = useDb()
  const owned = useVault((s) => s.owned)
  return useMemo(() => ownedByName(db, owned), [db, owned])
}

function Row({ card, qty, max, owned, onChange, note }: { card: Card; qty: number; max: number; owned: number; onChange: (q: number) => void; note?: string }) {
  const location = useLocation()
  const missing = Math.max(0, qty - owned)
  return (
    <motion.li layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="row">
      <Link to={`/carta/${card.id}`} state={{ background: location }} className="row-art">
        <img src={asset(card.image_file)} alt="" loading="lazy" />
      </Link>
      <div className="row-body">
        <p className="row-name">{card.name}</p>
        <p className="row-meta">
          {card.energy != null && <EnergyGlyph value={card.energy} />}
          {card.might != null && (
            <span>
              <MightGlyph /> {card.might}
            </span>
          )}
          {note && <span>{note}</span>}
          {missing > 0 ? <span className="todo">ti mancano {missing}</span> : owned > 0 ? <span className="ok">ce l’hai</span> : null}
        </p>
      </div>
      <div className="row-step">
        <button type="button" onClick={() => onChange(qty - 1)} aria-label={`Togli ${card.name}`}>
          −
        </button>
        <motion.span key={qty} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="row-qty">
          {qty}
        </motion.span>
        <button type="button" onClick={() => onChange(qty + 1)} disabled={qty >= max} aria-label={`Aggiungi ${card.name}`}>
          +
        </button>
      </div>
    </motion.li>
  )
}

const GROUPS: { label: string; test: (c: Card) => boolean }[] = [
  { label: 'Campioni', test: (c) => isChampionUnit(c) },
  { label: 'Unità', test: (c) => /Unit/.test(c.type) && !isChampionUnit(c) },
  { label: 'Magie', test: (c) => /Spell/.test(c.type) },
  { label: 'Gear', test: (c) => /Gear/.test(c.type) },
]

function CoreCard({ card, label, note, owned }: { card: Card; label: string; note: string; owned: number }) {
  const location = useLocation()
  return (
    <Link to={`/carta/${card.id}`} state={{ background: location }} className="core-card">
      <img src={asset(card.image_file)} alt={card.name} loading="lazy" />
      <span className="core-card-label">{label}</span>
      <span className="core-card-name">{card.name}</span>
      <span className="tiny">{note}</span>
      <span className={`core-card-owned ${owned ? 'ok' : 'todo'}`}>{owned ? 'Ce l’hai' : 'Non la possiedi'}</span>
    </Link>
  )
}

function DeckTab({ deck, edit }: { deck: Deck; edit: (fn: (d: Deck) => void) => void }) {
  const db = useDb()
  const names = useOwnedNames()
  const legend = db.byId.get(deck.legendId!)!
  const [pickBf, setPickBf] = useState(false)
  const entries = Object.entries(deck.main)
    .map(([id, q]) => [db.byId.get(id), q] as const)
    .filter((e): e is readonly [Card, number] => !!e[0])
    .sort((a, b) => (a[0].energy ?? 0) - (b[0].energy ?? 0) || a[0].name.localeCompare(b[0].name))
  const runeOptions = uniqueByName(db.cards.filter((c) => c.type === 'Basic Rune' && fitsIdentity(c, legend.domains)))
  const bfOptions = uniqueByName(db.cards.filter((c) => isBattlefield(c) && !/Token/.test(c.type) && fitsIdentity(c, legend.domains)))
  const setMain = (id: string, q: number) =>
    edit((d) => {
      if (q <= 0 && id !== d.championId) delete d.main[id]
      else d.main[id] = Math.max(id === d.championId ? 1 : 0, q)
    })

  const champion = deck.championId ? db.byId.get(deck.championId) : undefined

  return (
    <div className="deck-tab">
      <section className="section">
        <div className="section-head">
          <h2>Legend e campione</h2>
        </div>
        <div className="core-cards">
          <CoreCard card={legend} label="Champion Legend" note="Resta nella Legend Zone, non fa parte del mazzo (103.2.a)" owned={names.get(legend.name) ?? 0} />
          {champion && (
            <CoreCard card={champion} label="Campione scelto" note="Inizia nella Champion Zone e conta nelle 40 carte (103.3.a)" owned={names.get(champion.name) ?? 0} />
          )}
        </div>
      </section>

      {GROUPS.map((g) => {
        const rows = entries.filter(([c]) => g.test(c))
        if (!rows.length) return null
        return (
          <section key={g.label} className="section">
            <div className="section-head">
              <h2>{g.label}</h2>
              <span className="tiny">{rows.reduce((a, [, q]) => a + q, 0)}</span>
            </div>
            <motion.ul layout className="rows">
              <AnimatePresence initial={false}>
                {rows.map(([c, q]) => (
                  <Row
                    key={c.id}
                    card={c}
                    qty={q}
                    max={isUnique(c) ? 1 : MAX_COPIES}
                    owned={names.get(c.name) ?? 0}
                    onChange={(n) => setMain(c.id, n)}
                    note={c.id === deck.championId ? 'Campione scelto' : isSignature(c) ? 'Signature' : undefined}
                  />
                ))}
              </AnimatePresence>
            </motion.ul>
          </section>
        )
      })}

      <section className="section">
        <div className="section-head">
          <h2>Rune</h2>
          <span className={countOf(deck.runes) === RUNES_REQUIRED ? 'tiny ok' : 'tiny todo'}>
            {countOf(deck.runes)} / {RUNES_REQUIRED}
          </span>
        </div>
        <ul className="rows">
          {runeOptions.map((r) => (
            <Row
              key={r.id}
              card={r}
              qty={deck.runes[r.id] ?? 0}
              max={RUNES_REQUIRED}
              owned={names.get(r.name) ?? 0}
              onChange={(n) =>
                edit((d) => {
                  if (n <= 0) delete d.runes[r.id]
                  else d.runes[r.id] = n
                })
              }
            />
          ))}
        </ul>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Campi di battaglia</h2>
          <span className={deck.battlefields.length === BATTLEFIELDS_REQUIRED ? 'tiny ok' : 'tiny todo'}>
            {deck.battlefields.length} / {BATTLEFIELDS_REQUIRED}
          </span>
        </div>
        <div className="bf-row">
          {deck.battlefields.map((bid) => {
            const b = db.byId.get(bid)
            if (!b) return null
            return (
              <button key={bid} type="button" className="bf" onClick={() => edit((d) => void (d.battlefields = d.battlefields.filter((x) => x !== bid)))} aria-label={`Togli ${b.name}`}>
                <img src={asset(b.image_file)} alt="" />
                <span>{b.name}</span>
                <span className="bf-x">✕</span>
              </button>
            )
          })}
          {deck.battlefields.length < BATTLEFIELDS_REQUIRED && (
            <button type="button" className="bf bf-add" onClick={() => setPickBf((v) => !v)}>
              {pickBf ? 'Chiudi' : '+ Aggiungi campo'}
            </button>
          )}
        </div>
        <AnimatePresence>
          {pickBf && deck.battlefields.length < BATTLEFIELDS_REQUIRED && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
              <div className="bf-picker">
                {bfOptions
                  .filter((b) => !deck.battlefields.some((x) => db.byId.get(x)?.name === b.name))
                  .sort((a, b) => (names.get(b.name) ?? 0) - (names.get(a.name) ?? 0))
                  .map((b) => (
                    <button key={b.id} type="button" className="bf" onClick={() => edit((d) => void d.battlefields.push(b.id))}>
                      <img src={asset(b.image_file)} alt="" loading="lazy" />
                      <span>
                        {b.name} {names.get(b.name) ? <em className="ok">· ce l’hai</em> : null}
                      </span>
                    </button>
                  ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------

function AddTab({ deck, edit }: { deck: Deck; edit: (fn: (d: Deck) => void) => void }) {
  const db = useDb()
  const owned = useVault((s) => s.owned)
  const names = useOwnedNames()
  const [focus, setFocus] = useState<string[]>([])
  const [onlyOwned, setOnlyOwned] = useState(false)
  const [q, setQ] = useState('')
  const legend = db.byId.get(deck.legendId!)!
  const themes = useMemo(() => deckThemes(deck, db).slice(0, 10), [deck, db])
  const suggestions = useMemo(() => suggestCards(deck, db, { focus, owned, onlyOwned, limit: 30 }), [deck, db, focus, owned, onlyOwned])

  const legal = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    const tag = legendChampionTag(legend, db)
    return uniqueByName(
      db.cards.filter(
        (c) =>
          !isLegend(c) &&
          !isBattlefield(c) &&
          !isRune(c) &&
          !/Token/.test(c.type) &&
          c.type !== '' &&
          fitsIdentity(c, legend.domains) &&
          (!isSignature(c) || (tag && c.tags.includes(tag))) &&
          (c.name.toLowerCase().includes(needle) || cardParagraphs(c.text).some((p) => p.toLowerCase().includes(needle))),
      ),
    ).slice(0, 40)
  }, [q, db, legend])

  const inDeck = (c: Card) => Object.entries(deck.main).reduce((a, [id, n]) => a + (db.byId.get(id)?.name === c.name ? n : 0), 0)
  const add = (c: Card) => edit((d) => void (d.main[c.id] = (d.main[c.id] ?? 0) + 1))

  return (
    <div className="add-tab">
      <div className="search" style={{ marginTop: 16 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca una carta legale per questo mazzo" aria-label="Cerca carte" />
      </div>

      {q.trim() ? (
        <ul className="rows" style={{ marginTop: 14 }}>
          {legal.map((c) => (
            <SuggestionRow key={c.id} card={c} inDeck={inDeck(c)} owned={names.get(c.name) ?? 0} reasons={[]} onAdd={() => add(c)} />
          ))}
          {!legal.length && <p className="empty">Nessuna carta legale con questo nome o testo.</p>}
        </ul>
      ) : (
        <>
          <section className="section">
            <div className="section-head">
              <h2>Suggerite per questo mazzo</h2>
            </div>
            <p className="muted picker-help">
              Indizi, non regole: confronto tag e parole chiave della tua Legend, del campione e delle carte già nel mazzo. Tocca un tema per dargli più peso.
            </p>
            <div className="chips" style={{ margin: '12px 0 4px' }}>
              <button className="chip" aria-pressed={onlyOwned} onClick={() => setOnlyOwned((v) => !v)}>
                Solo carte che possiedo
              </button>
              {themes.map((t) => (
                <button
                  key={t.key}
                  className="chip"
                  aria-pressed={focus.includes(t.key)}
                  onClick={() => setFocus((f) => (f.includes(t.key) ? f.filter((x) => x !== t.key) : [...f, t.key]))}
                >
                  {t.kind === 'keyword' ? t.label : `#${t.label}`}
                </button>
              ))}
            </div>
          </section>
          <motion.ul layout className="rows">
            {suggestions.map((s) => (
              <SuggestionRow key={s.card.id} card={s.card} inDeck={inDeck(s.card)} owned={names.get(s.card.name) ?? 0} reasons={s.reasons} onAdd={() => add(s.card)} />
            ))}
            {!suggestions.length && <p className="empty">Nessun suggerimento con questi filtri.</p>}
          </motion.ul>
        </>
      )}
    </div>
  )
}

function SuggestionRow({ card, inDeck, owned, reasons, onAdd }: { card: Card; inDeck: number; owned: number; reasons: string[]; onAdd: () => void }) {
  const location = useLocation()
  const max = isUnique(card) ? 1 : MAX_COPIES
  return (
    <motion.li layout className="row row-suggest" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Link to={`/carta/${card.id}`} state={{ background: location }} className="row-art">
        <img src={asset(card.image_file)} alt="" loading="lazy" />
      </Link>
      <div className="row-body">
        <p className="row-name">{card.name}</p>
        <p className="row-meta">
          {card.energy != null && <EnergyGlyph value={card.energy} />}
          <span>{card.type}</span>
          {owned > 0 && <span className="ok">ne hai {owned}</span>}
          {inDeck > 0 && <span>nel mazzo {inDeck}</span>}
        </p>
        {reasons.length > 0 && (
          <ul className="reasons">
            {reasons.slice(0, 3).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>
      <motion.button type="button" className="add-btn" onClick={onAdd} disabled={inDeck >= max} whileTap={{ scale: 0.85, rotate: 90 }} aria-label={`Aggiungi ${card.name}`}>
        +
      </motion.button>
    </motion.li>
  )
}

// ---------------------------------------------------------------------------

function RulesTab({ deck }: { deck: Deck }) {
  const db = useDb()
  const owned = useVault((s) => s.owned)
  const issues = validateDeck(deck, db)
  const [open, setOpen] = useState<string | null>(null)
  const cov = ownedCoverage(deck, db, owned)
  return (
    <div className="section">
      {issues.length === 0 ? (
        <div className="legal-ok">
          <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
            ✓
          </motion.span>
          <div>
            <h2>Mazzo legale</h2>
            <p className="muted">Rispetta tutte le regole di costruzione del Core Rules (sezione 103) per il duello 1 contro 1.</p>
          </div>
        </div>
      ) : (
        <ul className="issues">
          {issues.map((i, n) => (
            <li key={n} className={`issue issue-${i.level}`}>
              <p>{i.text}</p>
              <button type="button" className="link-more" onClick={() => setOpen(open === `${n}` ? null : `${n}`)}>
                Regola {i.rule}
              </button>
              {open === `${n}` && <RuleQuote refs={[i.rule]} />}
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ marginTop: 18 }}>
        Delle {cov.need} carte del mazzo principale ne possiedi {cov.have}.
        {cov.need - cov.have > 0 ? ` Te ne mancano ${cov.need - cov.have}.` : ''}
      </p>
    </div>
  )
}

function StatusBar({ deck, onIssues }: { deck: Deck; onIssues: () => void }) {
  const db = useDb()
  const issues = validateDeck(deck, db)
  const main = countOf(deck.main)
  const runes = countOf(deck.runes)
  return (
    <motion.button type="button" className="status-bar" onClick={onIssues} initial={{ y: 80 }} animate={{ y: 0 }}>
      <span className={main >= MAIN_MIN ? 'ok' : ''}>
        <motion.strong key={main} initial={{ scale: 1.5 }} animate={{ scale: 1 }}>
          {main}
        </motion.strong>
        /{MAIN_MIN} carte
      </span>
      <span className={runes === RUNES_REQUIRED ? 'ok' : ''}>
        <strong>{runes}</strong>/{RUNES_REQUIRED} rune
      </span>
      <span className={deck.battlefields.length === BATTLEFIELDS_REQUIRED ? 'ok' : ''}>
        <strong>{deck.battlefields.length}</strong>/{BATTLEFIELDS_REQUIRED} campi
      </span>
      <span className={issues.length ? 'status-flag todo' : 'status-flag ok'}>{issues.length ? `${issues.length} da sistemare` : 'Legale'}</span>
    </motion.button>
  )
}
