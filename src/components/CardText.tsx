import { Fragment, type ReactNode } from 'react'
import { glossaryIdForTerm } from '../data/glossary'
import { AnyRuneGlyph, DomainIcon, EnergyGlyph, ExhaustGlyph, MightGlyph } from './Icons'
import { useSheet } from './sheetStore'
import './cardText.css'

const ENTITIES: Record<string, string> = { '&gt;': '>', '&lt;': '<', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }
const decode = (s: string) => s.replace(/&(gt|lt|amp|quot|#39|nbsp);/g, (m) => ENTITIES[m])

/** Divide il testo HTML ufficiale in paragrafi di testo semplice. */
export function cardParagraphs(html: string | null): string[] {
  if (!html) return []
  return decode(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
}

/** Parole chiave del glossario presenti nel testo, nell'ordine in cui compaiono. */
export function keywordIdsIn(html: string | null) {
  const ids: string[] = []
  for (const p of cardParagraphs(html)) {
    for (const m of p.matchAll(/\[([^\]]+)\]/g)) {
      const id = glossaryIdForTerm(m[1])
      if (id && !ids.includes(id)) ids.push(id)
    }
    // azioni scritte senza parentesi
    for (const [id, re] of [
      ['channel', /\bchannel\b/i],
      ['recycle', /\brecycle\b/i],
      ['banish', /\bbanish\b/i],
    ] as const) {
      if (re.test(p.replace(/\([^)]*\)/g, '')) && !ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

function Token({ token }: { token: string }) {
  const open = useSheet((s) => s.open)
  if (token.startsWith(':rb_')) {
    const name = token.slice(4, -1)
    if (name === 'might') return <MightGlyph />
    if (name === 'exhaust') return <ExhaustGlyph />
    if (name === 'rune_rainbow') return <AnyRuneGlyph />
    if (name.startsWith('energy_')) return <EnergyGlyph value={name.slice(7)} />
    if (name.startsWith('rune_')) return <DomainIcon domain={name.slice(5)} size={15} />
    return <>{token}</>
  }
  // [Keyword] o [Keyword N]
  const inner = token.slice(1, -1).trim()
  if (inner === '>') return <span className="kw-sep" aria-hidden>▸</span>
  const id = glossaryIdForTerm(inner)
  if (!id) return <span className="kw kw-plain">{inner}</span>
  return (
    <button type="button" className={`kw kw-${id}`} onClick={() => open(id)}>
      {inner}
    </button>
  )
}

function renderRun(text: string, keyBase: string): ReactNode[] {
  return text
    .split(/(\[[^\]]+\]|:rb_[a-z0-9_]+:)/g)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith('[') || part.startsWith(':rb_') ? <Token key={`${keyBase}-${i}`} token={part} /> : <Fragment key={`${keyBase}-${i}`}>{part}</Fragment>,
    )
}

export function CardText({ html }: { html: string | null }) {
  const paras = cardParagraphs(html)
  if (!paras.length) return null
  return (
    <div className="card-text">
      {paras.map((p, i) => (
        <p key={i}>
          {p.split(/(\([^)]*\))/g).filter(Boolean).map((chunk, j) =>
            chunk.startsWith('(') ? (
              <span key={j} className="reminder">
                {renderRun(chunk, `${i}-${j}`)}
              </span>
            ) : (
              <Fragment key={j}>{renderRun(chunk, `${i}-${j}`)}</Fragment>
            ),
          )}
        </p>
      ))}
    </div>
  )
}
