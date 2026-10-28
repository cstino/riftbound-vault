import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import './styles/global.css'
import App from './App'
import { DbProvider } from './lib/useDb'
import { Splash } from './components/Splash'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <DbProvider fallback={<Splash />}>
          <App />
        </DbProvider>
      </HashRouter>
    </MotionConfig>
  </StrictMode>,
)
