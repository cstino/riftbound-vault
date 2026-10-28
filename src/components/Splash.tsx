import { motion } from 'motion/react'
import { asset } from '../lib/data'

const DOMAINS = ['fury', 'calm', 'mind', 'body', 'chaos', 'order']

/** Schermata di caricamento: le sei rune dei domini ruotano attorno al nome. */
export function Splash() {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <div style={{ position: 'relative', width: 180, height: 180, display: 'grid', placeItems: 'center' }}>
        <motion.div
          style={{ position: 'absolute', inset: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
        >
          {DOMAINS.map((d, i) => {
            const a = (i / DOMAINS.length) * Math.PI * 2
            return (
              <img
                key={d}
                src={asset(`icons/domain_${d}.webp`)}
                alt=""
                width={28}
                height={28}
                style={{ position: 'absolute', left: 76 + Math.cos(a) * 76, top: 76 + Math.sin(a) * 76 }}
              />
            )
          })}
        </motion.div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>Rift Vault</span>
      </div>
    </div>
  )
}
