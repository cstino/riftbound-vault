import { readFileSync, writeFileSync } from 'fs'
import { it } from 'vitest'
import { REGISTRY } from '../../src/lib/game/registry'
import '../../src/lib/game/index'
const require_out: string[] = []
it('missing', () => {
  const prods = JSON.parse(readFileSync('public/data/products.json', 'utf8'))
  const raw = JSON.parse(readFileSync('public/data/cards.json', 'utf8'))
  const cards = Array.isArray(raw) ? raw : raw.cards
  for (const p of prods) for (const d of p.decks) {
    if (!/Evelynn|Fiora|Vex/.test(d.name)) continue
    const out: string[] = []
    for (const e of d.cards) {
      const c = cards.find((c: any) => c.id === e.id)
      if (!c || REGISTRY.has(c.name)) continue
      out.push(`${e.qty}x ${c.name} [${c.type}/${e.section}] E${c.energy} P${c.power} M${c.might} :: ${(c.text ?? '').replace(/<[^>]+>/g, ' ')}`)
    }
    require_out.push(`== ${d.name} (${p.name}) mancano ${out.length}\n` + out.join('\n'))
  }
  writeFileSync('scripts/tmp/missing.txt', require_out.join('\n'))
})
