import { memo } from 'react'
import { motion } from 'motion/react'
import { Link, useLocation } from 'react-router-dom'
import type { Card } from '../lib/types'
import { isBattlefield, cardImage } from '../lib/data'
import './cardThumb.css'

interface Props {
  card: Card
  qty?: number
  /** Mostra la carta spenta se non è posseduta. */
  dimIfMissing?: boolean
  size?: 'sm' | 'md' | 'lg'
  layoutPrefix?: string
  /** Usabilità nei tornei (0-1), se nota. */
  usage?: number
}

export const CardThumb = memo(function CardThumb({ card, qty = 0, dimIfMissing, size = 'md', layoutPrefix = 'grid', usage }: Props) {
  const location = useLocation()
  const landscape = isBattlefield(card)
  return (
    <Link
      to={`/carta/${card.id}`}
      state={{ background: location, layoutId: `${layoutPrefix}-${card.id}` }}
      className={`thumb thumb-${size}${landscape ? ' thumb-land' : ''}${dimIfMissing && !qty ? ' thumb-missing' : ''}`}
      aria-label={`${card.name}${qty ? `, ne possiedi ${qty}` : ''}`}
    >
      <motion.img
        layoutId={`${layoutPrefix}-${card.id}`}
        src={cardImage(card)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      {(qty > 1 || (dimIfMissing && qty > 0)) && <span className="thumb-qty">×{qty}</span>}
      {usage !== undefined && (
        <span className={`thumb-use ${usage >= 0.3 ? 'use-hi' : usage >= 0.05 ? 'use-mid' : 'use-lo'}`} title="Presenza nelle liste di torneo ben piazzate">
          {Math.round(usage * 100)}%
        </span>
      )}
    </Link>
  )
})
