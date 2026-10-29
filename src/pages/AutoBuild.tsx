import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useDb } from '../lib/useDb'
import { useVault } from '../lib/store'
import { useMeta } from '../lib/useMeta'
import { cardImage, isChampionUnit, isLegend, legendChampionTag } from '../lib/data'
import { autoBuild, fromText, type BuiltLine } from '../lib/autobuild'
import type { Card } from '../lib/types'
import { OverallRing } from './DeckBuilder'
import './deckBuilder.css'
import './autoBuild.css'

/** Una stampa per nome tra quelle possedute (anche chiuse nei mazzi). */
function ownedByName(ids: string[], db: ReturnType<typeof useDb>, test: (c: Card) => boolean) {
  const m = new Map<string, Card>()
  for (const id of ids) {
    const c = db.byId.get(id)
    if (c && test(c) && !m.has(c.name)) m.set(c.name, c)
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Costruzione automatica: scegli Legend e campione, il mazzo si compone con le carte che possiedi. */
export function AutoBuild() {
  const db = useDb()
  const navigate = useNavigate()
  const owned = useVault((s) => s.owned)
  const decks = useVault((s) => s.decks)
  const saveDeck = useVault((s) => s.saveDeck)
  const meta = useMeta()
  const [legend, setLegend] = useState<Card | null>(null)
  const [champ, setChamp] = useState<Card | null>(null)
  const [useBoxed, setUseBoxed] = useState(true)

  const ids = useMemo(() => Object.keys(owned).filter((id) => owned[id] > 0), [owned])
  const legends = useMemo(() => ownedByName(ids, db, (c) => isLegend(c) && !!legendChampionTag(c, db)), [ids, db])
  const tag = legend ? legendChampionTag(legend, db) : null
  const champs = useMemo(() => (tag ? ownedByName(ids, db, (c) => isChampionUnit(c) && c.tags.includes(tag)) : []), [ids, db, tag])
  const result = useMemo(
    () => (legend && champ && meta !== undefined ? autoBuild(legend, champ, db, owned, decks, meta, useBoxed) : null),
    [legend, champ, db, owned, decks, meta, useBoxed],
  )

  // Mazzi da cui servono carte: per sapere cosa liberare o spostare
  const fromBoxes = useMemo(() => {
    if (!result?.ok) return []
    const m = new Map<string, number>()
    for (const l of [result.legend, ...result.main, ...result.runes, ...result.battlefields]) for (const o of l.origins) if (o.from) m.set(o.from, (m.get(o.from) ?? 0) + o.q)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [result])

  return (
    <div className="builder auto">
      <header className="builder-head">
        <Link to="/mazzi" className="link-more">
          ← Deck
        </Link>
        <h1>Costruisci in automatico</h1>
        <p className="muted">
          Scegli Legend e campione: il mazzo si compone con le carte che possiedi, scelte con i dati dei tornei recenti, e per ogni carta vedi da dove arriva.
        </p>
      </header>

      <section className="section">
        <h2>1. Legend</h2>
        {legends.length === 0 ? (
          <p className="switch-none">Non hai nessuna Champion Legend nella collezione.</p>
        ) : (
          <PickRow
            cards={legends}
            selected={legend?.name}
            onPick={(c) => {
              setLegend(c)
              setChamp(null)
            }}
          />
        )}
      </section>

      {legend && (
        <section className="section">
          <h2>2. Campione</h2>
          {champs.length === 0 ? (
            <p className="switch-none">Non hai nessun campione con il tag {tag}: senza, il mazzo non si può costruire (regola 103.3.a).</p>
          ) : (
            <PickRow cards={champs} selected={champ?.name} onPick={setChamp} />
          )}
        </section>
      )}

      {legend && champ && (
        <label className="auto-toggle">
          <input type="checkbox" checked={useBoxed} onChange={(e) => setUseBoxed(e.target.checked)} />
          <span>
            Usa anche le carte chiuse nei mazzi che possiedi
            <span className="tiny muted"> (per giocarle dovrai liberarle o spostarle)</span>
          </span>
        </label>
      )}

      {result && !result.ok && (
        <motion.section className="section auto-fail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h2>Non è fattibile</h2>
          <ul>
            {result.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {!useBoxed && <p className="tiny muted">Prova ad attivare “Usa anche le carte chiuse nei mazzi che possiedi”.</p>}
        </motion.section>
      )}

      {result?.ok && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <section className="section overall">
            <div className="overall-main">
              {result.overall ? <OverallRing value={result.overall.overall} /> : <span className="auto-na">—</span>}
              <div className="overall-text">
                <h2>Mazzo pronto</h2>
                {result.overall ? (
                  <p>
                    Vittorie attese nei tornei: <strong>{Math.round(result.overall.expected * 100)}%</strong>{' '}
                    <span className="muted">
                      (tra {Math.round(result.overall.low * 100)}% e {Math.round(result.overall.high * 100)}%)
                    </span>
                  </p>
                ) : (
                  <p className="muted">Overall non disponibile: nessuna partita di torneo recente con questa Legend.</p>
                )}
              </div>
            </div>
            {result.overall?.weak && <p className="switch-weak">Stima poco affidabile: solo {result.overall.games} partite di torneo recenti con questa Legend.</p>}
            {fromBoxes.length > 0 && (
              <p className="auto-boxes">
                Usa carte chiuse nei mazzi che possiedi: {fromBoxes.map(([d, q]) => `${q} dal mazzo ${d}`).join(', ')}. Per giocarlo dovrai liberarle o spostarle.
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                saveDeck(result.deck)
                navigate(`/mazzi/${result.deck.id}`)
              }}
            >
              Salva come nuovo mazzo
            </button>
          </section>

          <Lines title="Legend" lines={[result.legend]} />
          <Lines title={`Mazzo principale · ${result.main.reduce((a, l) => a + l.qty, 0)} carte`} lines={result.main} />
          <Lines title={`Rune · ${result.runes.reduce((a, l) => a + l.qty, 0)}`} lines={result.runes} />
          <Lines title="Campi di battaglia" lines={result.battlefields} />
          {result.notes.map((n) => (
            <p key={n} className="tiny muted auto-note">
              {n}
            </p>
          ))}
          {meta && (
            <p className="tiny meta-credit">
              Data provided by{' '}
              <a href={meta.sourceUrl} target="_blank" rel="noreferrer">
                TopDeck.gg
              </a>
            </p>
          )}
        </motion.div>
      )}
    </div>
  )
}

function PickRow({ cards, selected, onPick }: { cards: Card[]; selected?: string; onPick: (c: Card) => void }) {
  return (
    <div className="auto-pick">
      {cards.map((c) => (
        <motion.button key={c.id} type="button" className={`auto-pick-item${selected === c.name ? ' auto-pick-on' : ''}`} onClick={() => onPick(c)} whileTap={{ scale: 0.95 }} aria-pressed={selected === c.name}>
          <img src={cardImage(c)} alt="" loading="lazy" />
          <span>{c.name}</span>
        </motion.button>
      ))}
    </div>
  )
}

function Lines({ title, lines }: { title: string; lines: BuiltLine[] }) {
  const location = useLocation()
  if (!lines.length) return null
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
      </div>
      <ul className="rows">
        {lines.map((l) => (
          <li key={l.card.id} className="row auto-line">
            <Link to={`/carta/${l.card.id}`} state={{ background: location }} className="row-art">
              <img src={cardImage(l.card)} alt="" loading="lazy" />
            </Link>
            <div className="row-body">
              <p className="row-name">
                {l.qty} × {l.card.name}
              </p>
              <p className="row-meta">
                {l.origins.map((o) => (
                  <span key={o.from ?? 'sfusa'} className={o.from ? 'box-tag' : 'auto-loose'}>
                    {fromText([o])}
                  </span>
                ))}
              </p>
              {l.why && <p className="tiny muted">{l.why}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
