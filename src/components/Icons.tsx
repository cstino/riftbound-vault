import type { Domain } from '../lib/types'
import { asset } from '../lib/data'
import './icons.css'

export function DomainIcon({ domain, size = 18 }: { domain: Domain | string; size?: number }) {
  if (domain === 'Colorless') return null
  return (
    <img
      className="domain-icon"
      src={asset(`icons/domain_${domain.toLowerCase()}.webp`)}
      alt={domain}
      title={domain}
      width={size}
      height={size}
    />
  )
}

export function RarityIcon({ rarity, size = 16 }: { rarity: string | null; size?: number }) {
  if (!rarity) return null
  return (
    <img
      className="rarity-icon"
      src={asset(`icons/rarity_${rarity.toLowerCase()}.webp`)}
      alt={rarity}
      title={rarity}
      width={size}
      height={size}
    />
  )
}

/** Simbolo della Might: lo scudo con la lama stampato sulle carte. */
export function MightGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg className="glyph" width={size} height={size} viewBox="0 0 16 16" aria-label="Might" role="img">
      <path d="M8 1.5 13.5 3.6v4.1c0 3.3-2.3 5.6-5.5 6.8C4.8 13.3 2.5 11 2.5 7.7V3.6Z" fill="currentColor" opacity=".9" />
      <path d="M8 3.8v8.2M6 9.6h4" stroke="var(--ink-0)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function EnergyGlyph({ value }: { value: string | number }) {
  return (
    <span className="energy-glyph" aria-label={`${value} Energia`}>
      {value}
    </span>
  )
}

/** Potere di qualsiasi dominio: i sei colori in un cerchio. */
export function AnyRuneGlyph({ size = 14 }: { size?: number }) {
  return <span className="any-rune" style={{ width: size, height: size }} aria-label="Potere di qualsiasi dominio" />
}

export function ExhaustGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg className="glyph" width={size} height={size} viewBox="0 0 16 16" aria-label="Esaurisci" role="img">
      <rect x="4.2" y="2.4" width="7.6" height="10.6" rx="1.4" transform="rotate(28 8 8)" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.2 11.5a6 6 0 0 0 4.3 3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function TypeIcon({ type, size = 16 }: { type: string; size?: number }) {
  const key = /Legend/.test(type)
    ? 'legend'
    : /Battlefield/.test(type)
      ? 'battlefield'
      : /Rune/.test(type)
        ? 'rune'
        : /Spell/.test(type)
          ? 'spell'
          : /Gear/.test(type)
            ? 'gear'
            : /Champion/.test(type)
              ? 'champion'
              : 'unit'
  return <img className="type-icon" src={asset(`icons/type_${key}.webp`)} alt="" width={size} height={size} />
}
