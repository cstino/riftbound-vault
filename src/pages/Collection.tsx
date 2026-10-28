import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { useDb } from '../lib/useDb'
import { useVault } from '../lib/store'
import { RARITY_ORDER, SET_ORDER, sortCards } from '../lib/data'
import { DOMAINS, type Card } from '../lib/types'
import { CardThumb } from '../components/CardThumb'
import { DomainIcon, RarityIcon } from '../components/Icons'
import { cardParagraphs } from '../components/CardText'
import './collection.css'

const TYPES: { key: string; label: string; test: (c: Card) => boolean }[] = [
  { key: 'unit', label: 'Unità', test: (c) => c.type === 'Unit' || c.type === 'Signature Unit' },
  { key: 'champion', label: 'Campioni', test: (c) => c.type === 'Champion Unit' },
  { key: 'spell', label: 'Magie', test: (c) => /Spell/.test(c.type) },
  { key: 'gear', label: 'Gear', test: (c) => /Gear/.test(c.type) && !/Token/.test(c.type) },
  { key: 'legend', label: 'Legend', test: (c) => /Legend/.test(c.type) },
  { key: 'battlefield', label: 'Campi', test: (c) => /Battlefield/.test(c.type) && !/Token/.test(c.type) },
  { key: 'rune', label: 'Rune', test: (c) => /Rune/.test(c.type) },
]

const PAGE = 90

export function Collection() {
  const db = useDb()
  const owned = useVault((s) => s.owned)
  const [params, setParams] = useSearchParams()
  const all = params.get('tutte') === '1'
  const q = params.get('q') ?? ''
  const set = params.get('set')
  const domain = params.get('dominio')
  const type = params.get('tipo')
  const rarity = params.get('rarita')
  const [limit, setLimit] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value == null || value === '') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }
  const toggle = (key: string, value: string) => update(key, params.get(key) === value ? null : value)

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const typeTest = TYPES.find((t) => t.key === type)?.test
    return db.cards
      .filter((c) => (all ? true : owned[c.id]))
      .filter((c) => !set || c.set === set)
      .filter((c) => !domain || c.domains.includes(domain as never))
      .filter((c) => !typeTest || typeTest(c))
      .filter((c) => !rarity || c.rarity === rarity)
      .filter(
        (c) =>
          !needle ||
          c.name.toLowerCase().includes(needle) ||
          c.code.toLowerCase().includes(needle) ||
          c.tags.some((t) => t.toLowerCase() === needle) ||
          cardParagraphs(c.text).some((p) => p.toLowerCase().includes(needle)),
      )
      .sort(sortCards)
  }, [db, owned, all, q, set, domain, type, rarity])

  useEffect(() => setLimit(PAGE), [all, q, set, domain, type, rarity])

  // Carica altre carte quando si arriva in fondo
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setLimit((l) => l + PAGE)
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [results.length])

  const copies = results.reduce((a, c) => a + (owned[c.id] ?? 0), 0)

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Collezione</h1>
          <p>
            {results.length} carte{all ? '' : `, ${copies} copie`}
          </p>
        </div>
        <div className="seg" role="tablist" aria-label="Quali carte mostrare">
          {[
            { v: false, label: 'Mie' },
            { v: true, label: 'Tutte' },
          ].map((o) => (
            <button key={o.label} role="tab" aria-selected={all === o.v} onClick={() => update('tutte', o.v ? '1' : null)}>
              {all === o.v && <motion.span layoutId="seg-active" className="seg-active" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="search">
        <input
          value={q}
          onChange={(e) => update('q', e.target.value)}
          placeholder="Nome, codice, tag o testo (es. Hidden, Poro, VEN-013)"
          aria-label="Cerca"
        />
      </div>

      <div className="filters">
        <div className="chips" aria-label="Set">
          {SET_ORDER.map((s) => (
            <button key={s} className="chip" aria-pressed={set === s} onClick={() => toggle('set', s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="chips" aria-label="Dominio">
          {DOMAINS.map((d) => (
            <button key={d} className="chip" aria-pressed={domain === d} onClick={() => toggle('dominio', d)}>
              <DomainIcon domain={d} size={16} />
              {d}
            </button>
          ))}
        </div>
        <div className="chips" aria-label="Tipo">
          {TYPES.map((t) => (
            <button key={t.key} className="chip" aria-pressed={type === t.key} onClick={() => toggle('tipo', t.key)}>
              {t.label}
            </button>
          ))}
          {RARITY_ORDER.map((r) => (
            <button key={r} className="chip" aria-pressed={rarity === r} onClick={() => toggle('rarita', r)}>
              <RarityIcon rarity={r} size={14} />
              {r}
            </button>
          ))}
        </div>
      </div>

      {results.length === 0 ? (
        <div className="empty">
          <p>Nessuna carta con questi filtri.</p>
          {!all && (
            <button className="btn btn-small" style={{ marginTop: 12 }} onClick={() => update('tutte', '1')}>
              Cerca tra tutte le carte
            </button>
          )}
        </div>
      ) : (
        <div className="card-grid">
          {results.slice(0, limit).map((c) => (
            <CardThumb key={c.id} card={c} qty={owned[c.id] ?? 0} dimIfMissing={all} />
          ))}
        </div>
      )}
      {limit < results.length && <div ref={sentinel} style={{ height: 1 }} />}
    </div>
  )
}
