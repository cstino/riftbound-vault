import { AnimatePresence, motion } from 'motion/react'
import { Route, Routes, useLocation, type Location } from 'react-router-dom'
import { Nav } from './components/Nav'
import { KeywordSheet } from './components/KeywordSheet'
import { CardDetail } from './pages/CardDetail'
import { Home } from './pages/Home'
import { Collection } from './pages/Collection'
import { Decks } from './pages/Decks'
import { DeckBuilder } from './pages/DeckBuilder'
import { Learn } from './pages/Learn'
import { LearnChapterPage } from './pages/LearnChapter'
import { GlossaryPage } from './pages/GlossaryPage'
import './app.css'

export default function App() {
  const location = useLocation()
  const state = location.state as { background?: Location } | null
  // Il dettaglio carta si apre sopra la pagina da cui arrivi; con un link diretto, sopra la collezione.
  const isCard = location.pathname.startsWith('/carta/')
  const background = state?.background ?? (isCard ? ({ ...location, pathname: '/collezione' } as Location) : undefined)
  const pageLocation = background ?? location

  return (
    <div className="shell">
      <Nav />
      <main className="main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pageLocation.pathname.split('/').slice(0, 3).join('/')}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <Routes location={pageLocation}>
              <Route path="/" element={<Home />} />
              <Route path="/collezione" element={<Collection />} />
              <Route path="/mazzi" element={<Decks />} />
              <Route path="/mazzi/:id" element={<DeckBuilder />} />
              <Route path="/impara" element={<Learn />} />
              <Route path="/impara/guida/:id" element={<LearnChapterPage />} />
              <Route path="/impara/parola/:id" element={<GlossaryPage />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
      <AnimatePresence>{isCard && <CardDetail key={location.pathname} />}</AnimatePresence>
      <KeywordSheet />
    </div>
  )
}
