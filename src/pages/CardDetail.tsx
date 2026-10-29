import { useEffect, useMemo } from 'react'
import { motion } from 'motion/react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useDb } from '../lib/useDb'
import { useVault } from '../lib/store'
import { CardText, keywordIdsIn } from '../components/CardText'
import { HoloCard } from '../components/HoloCard'
import { Explainer } from '../components/Explainer'
import { DomainIcon, EnergyGlyph, MightGlyph, RarityIcon, TypeIcon } from '../components/Icons'
import { useMeta } from '../lib/useMeta'
import { cardUsage } from '../lib/deck'
import './cardDetail.css'

export function CardDetail() {
  const db = useDb()
  const navigate = useNavigate()
  const location = useLocation()
  // Il dettaglio è fuori da <Routes> (si sovrappone alla pagina), quindi l'id si legge dal percorso
  const id = decodeURIComponent(location.pathname.split('/')[2] ?? '')
  const state = location.state as { background?: unknown; layoutId?: string } | null
  const card = db.byId.get(id)
  const qty = useVault((s) => (card ? (s.owned[card.id] ?? 0) : 0))
  const addQty = useVault((s) => s.addQty)
  const decks = useVault((s) => s.decks)

  const close = () => (state?.background ? navigate(-1) : navigate('/collezione'))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [])

  // Da dove vengono le copie: chiuse nei mazzi posseduti, liberate, oppure sfuse
  const origin = useMemo(() => {
    if (!card) return { locked: [] as { name: string; q: number }[], freed: [] as { name: string; q: number }[], loose: 0 }
    const locked: { name: string; q: number }[] = []
    const freed: { name: string; q: number }[] = []
    for (const d of decks) {
      const q = d.addedToCollection?.[card.id] ?? 0
      if (q > 0) (d.released ? freed : locked).push({ name: d.name, q })
    }
    const loose = Math.max(0, qty - locked.reduce((a, x) => a + x.q, 0))
    return { locked, freed, loose }
  }, [card, decks, qty])
  const meta = useMeta()
  const use = useMemo(() => (meta && card ? cardUsage(db, meta).get(card.name) : undefined), [meta, db, card])
  const keywords = useMemo(() => keywordIdsIn(card?.text ?? null), [card])
  const printings = useMemo(() => (card ? db.cards.filter((c) => c.name === card.name && c.id !== card.id) : []), [db, card])
  const inDecks = useMemo(
    () => (card ? decks.filter((d) => Object.keys(d.main).some((cid) => db.byId.get(cid)?.name === card.name) || d.legendId === card.id || d.battlefields.includes(card.id)) : []),
    [decks, card, db],
  )

  if (!card) {
    return (
      <div className="detail-root">
        <div className="detail-scrim" onClick={close} />
        <div className="detail-panel">
          <p className="empty">Carta non trovata.</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div className="detail-root" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
      <motion.div
        className="detail-scrim"
        onClick={close}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      />
      <div className="detail-scroll">
        <button type="button" className="detail-close" onClick={close} aria-label="Chiudi">
          ✕
        </button>
        <div className="detail-hero">
          <HoloCard card={card} layoutId={state?.layoutId} />
        </div>

        <motion.div
          className="detail-panel"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
        >
          <header className="detail-head">
            <p className="detail-code">
              <RarityIcon rarity={card.rarity} /> {card.rarity} · {card.set_name} · {card.code}
            </p>
            <h1>{card.name}</h1>
            <div className="detail-meta">
              <span className="pill">
                <TypeIcon type={card.type} /> {card.type || 'Carta'}
              </span>
              {card.domains.filter((d) => (d as string) !== 'Colorless').map((d) => (
                <span key={d} className="pill">
                  <DomainIcon domain={d} size={16} /> {d}
                </span>
              ))}
              {card.energy != null && (
                <span className="pill">
                  <EnergyGlyph value={card.energy} /> Energia
                </span>
              )}
              {card.power != null && card.power > 0 && (
                <span className="pill">
                  {card.power} Potere {card.domains.length === 1 ? card.domains[0] : ''}
                </span>
              )}
              {card.might != null && (
                <span className="pill">
                  <MightGlyph /> {card.might} {/Gear/.test(card.type) ? 'Might Bonus' : 'Might'}
                </span>
              )}
            </div>
            {card.tags.length > 0 && <p className="detail-tags">{card.tags.join(' · ')}</p>}
            {use && (
              <p className="detail-use">
                Usabilità nei tornei: <strong>{Math.round(use.share * 100)}%</strong>{' '}
                <span className="muted">
                  (in {use.used} delle {use.possible} liste ben piazzate in cui può stare, ultimo anno)
                </span>
              </p>
            )}
          </header>

          <div className="owned-box">
            <div>
              <p className="owned-label">Nella tua collezione</p>
              <p className="owned-qty">
                <motion.span key={qty} initial={{ scale: 1.4, color: '#ff3ea5' }} animate={{ scale: 1, color: '#f4f0ff' }}>
                  {qty}
                </motion.span>{' '}
                {qty === 1 ? 'copia' : 'copie'}
              </p>
              {(origin.locked.length > 0 || origin.freed.length > 0) && (
                <ul className="owned-origin">
                  {origin.locked.map((x) => (
                    <li key={x.name}>
                      {x.q} nel mazzo {x.name}: chiuse nella scatola, non usabili in altri mazzi
                    </li>
                  ))}
                  <li>
                    {origin.loose} {origin.loose === 1 ? 'sfusa' : 'sfuse'}, usabili in qualsiasi mazzo
                    {origin.freed.length > 0 && ` (di cui ${origin.freed.map((x) => `${x.q} liberate da ${x.name}`).join(', ')})`}
                  </li>
                </ul>
              )}
            </div>
            <div className="stepper">
              <button type="button" onClick={() => addQty(card.id, -1)} disabled={qty === 0} aria-label="Togli una copia">
                −
              </button>
              <button type="button" onClick={() => addQty(card.id, 1)} aria-label="Aggiungi una copia">
                +
              </button>
            </div>
          </div>

          {card.text && (
            <section className="detail-section">
              <h2>Testo della carta</h2>
              <div className="detail-text">
                <CardText html={card.text} />
              </div>
              {keywords.length > 0 && <p className="tiny">Tocca una parola evidenziata per la spiegazione.</p>}
            </section>
          )}

          {keywords.length > 0 && (
            <section className="detail-section">
              <h2>Cosa significano le parole chiave</h2>
              <div className="explainers">
                {keywords.map((k) => (
                  <div key={k} className="explainer-card">
                    <Explainer id={k} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {inDecks.length > 0 && (
            <section className="detail-section">
              <h2>Nei tuoi mazzi</h2>
              <div className="chips">
                {inDecks.map((d) => (
                  <Link key={d.id} to={`/mazzi/${d.id}`} className="chip">
                    {d.name}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {printings.length > 0 && (
            <section className="detail-section">
              <h2>Altre versioni</h2>
              <div className="chips">
                {printings.map((p) => (
                  <Link key={p.id} to={`/carta/${p.id}`} state={location.state} replace className="chip">
                    {p.code} {p.alt_art ? '· Alt Art' : ''}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {card.artist && <p className="tiny detail-artist">Illustrazione: {card.artist}</p>}
        </motion.div>
      </div>
    </motion.div>
  )
}
