import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { cardImage } from '../lib/data'
import { useDb } from '../lib/useDb'
import './game.css'

const MODES = [
  {
    to: '/playground/partita',
    title: 'Partita contro il PC',
    text: 'Una partita completa 1 contro 1 con le regole ufficiali: scegli il tuo mazzo e quello del PC.',
    cta: 'Gioca',
    art: 'Zed, Without a Sound',
  },
  {
    to: '/playground/online',
    title: 'Partita online',
    text: 'Contro un amico, ognuno dal suo dispositivo: crea una partita e dagli il codice, oppure entra con il suo.',
    cta: 'Gioca online',
    art: 'Vi, Destructive',
  },
  {
    to: '/playground/allenamento',
    title: 'Allenamento sui combattimenti',
    text: 'Combattimenti preparati con carte vere: assegni tu i danni, le regole decidono l’esito.',
    cta: 'Allenati',
    art: 'Shen, Kinkou',
  },
]

export function Playground() {
  const db = useDb()
  return (
    <div className="playground">
      <header className="page-head">
        <div>
          <h1>Playground</h1>
          <p>Metti in pratica le regole contro il PC o contro un amico.</p>
        </div>
      </header>
      <div className="modes">
        {MODES.map((m, i) => {
          const card = db.cards.find((c) => c.name === m.art && !c.alt_art)
          return (
            <motion.div key={m.to} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}>
              <Link to={m.to} className="mode">
                {card && <img className="mode-art" src={cardImage(card)} alt="" />}
                <span className="mode-body">
                  <strong>{m.title}</strong>
                  <span className="muted">{m.text}</span>
                  <span className="btn btn-primary btn-small">{m.cta}</span>
                </span>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
