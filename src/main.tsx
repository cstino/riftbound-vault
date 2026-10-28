import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import './styles/global.css'
import App from './App'
import { DbProvider } from './lib/useDb'
import { AuthGate } from './lib/auth'
import { Splash } from './components/Splash'

// Safari su iPhone ignora user-scalable=no: blocca qui il pinch-zoom (gesture* esistono solo su Safari)
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <AuthGate fallback={<Splash />}>
          {(userId) => (
            <DbProvider key={userId} userId={userId} fallback={<Splash />}>
              <App />
            </DbProvider>
          )}
        </AuthGate>
      </HashRouter>
    </MotionConfig>
  </StrictMode>,
)
