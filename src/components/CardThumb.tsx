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
}

export const CardThumb = memo(function CardThumb({ card, qty = 0, dimIfMissing, size = 'md', layoutPrefix = 'grid' }: Props) {
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
    </Link>
  )
})
