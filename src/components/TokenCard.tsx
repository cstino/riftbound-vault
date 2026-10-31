import { cardImage, type CardDb } from '../lib/data'
import type { Card } from '../lib/types'
import './tokenCard.css'

/** Carta ufficiale del token nella galleria di Riot (Recruit, Sprite, Gold, Bird, Reflection), se c'è. */
export function officialToken(db: CardDb, name: string) {
  return db.cards.find((c) => c.type.includes('Token') && c.name === name)
}

// colore e simbolo dei token che la galleria ufficiale non ha
const LOOK: Record<string, { color: string; glyph: string }> = {
  Tentacle: { color: '#1fb5a8', glyph: 'tentacle' },
  'Shadow Clone': { color: '#8c5bff', glyph: 'shadow' },
  'Sand Soldier': { color: '#d9a441', glyph: 'spear' },
  Mech: { color: '#5b8fd9', glyph: 'gear' },
  Bomb: { color: '#f2711c', glyph: 'bomb' },
}

/**
 * Faccia di un token: la carta ufficiale se esiste, altrimenti una carta disegnata nello stesso
 * stile (nome, Might, tag e simbolo). `big` per la scheda di dettaglio.
 */
export function TokenCard({ card, db, big }: { card: Card; db: CardDb; big?: boolean }) {
  const official = officialToken(db, card.name)
  if (official) return <img className={`token-official${big ? ' token-card-big' : ''}`} src={cardImage(official)} alt={card.name} draggable={false} />
  const look = LOOK[card.name] ?? { color: '#8c5bff', glyph: 'star' }
  const isUnit = card.might != null
  return (
    <span className={`token-card${big ? ' token-card-big' : ''}`} style={{ ['--tk' as string]: look.color }} role="img" aria-label={`Token ${card.name}`}>
      <span className="token-art">
        <Glyph name={look.glyph} />
      </span>
      {isUnit && <span className="token-might">{card.might}</span>}
      <span className="token-band">
        <span className="token-kind">{isUnit ? 'Token Unit' : 'Token Gear'}</span>
        <span className="token-name">{card.name}</span>
        {card.tags.length > 0 && <span className="token-tag">{card.tags.join(' · ')}</span>}
      </span>
    </span>
  )
}

function Glyph({ name }: { name: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 3.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 64 64" className="token-glyph" aria-hidden>
      {name === 'tentacle' && (
        <g {...common}>
          <path d="M22 58c-6-10 2-18 10-22s12-12 6-20c-4-5-11-3-11 3 0 4 4 6 7 4" />
          <path d="M40 58c-2-6 2-10 7-13s7-9 3-13" />
          <circle cx="29" cy="46" r="1.6" fill="currentColor" />
          <circle cx="35" cy="38" r="1.6" fill="currentColor" />
          <circle cx="47" cy="47" r="1.4" fill="currentColor" />
        </g>
      )}
      {name === 'shadow' && (
        <g {...common}>
          <path d="M32 8l6 12-6 4-6-4z" />
          <path d="M18 56c0-14 6-24 14-28 8 4 14 14 14 28" />
          <path d="M22 40l-10 6M42 40l10 6" />
        </g>
      )}
      {name === 'spear' && (
        <g {...common}>
          <path d="M14 54L46 14" />
          <path d="M46 14l6-4-2 8z" fill="currentColor" />
          <path d="M20 30c4-8 14-12 22-8-2 10-10 16-20 16" />
        </g>
      )}
      {name === 'gear' && (
        <g {...common}>
          <circle cx="32" cy="32" r="9" />
          <path d="M32 10v8M32 46v8M10 32h8M46 32h8M16.5 16.5l5.7 5.7M41.8 41.8l5.7 5.7M16.5 47.5l5.7-5.7M41.8 22.2l5.7-5.7" />
        </g>
      )}
      {name === 'bomb' && (
        <g {...common}>
          <circle cx="28" cy="38" r="16" />
          <path d="M38 24l6-6M44 18c4-2 8 0 8 4" />
          <path d="M50 10l1 3M56 14l-3 1M55 7l-2 2" />
        </g>
      )}
      {name === 'star' && <path {...common} d="M32 10l6 14 15 1-12 9 4 15-13-8-13 8 4-15-12-9 15-1z" />}
    </svg>
  )
}
