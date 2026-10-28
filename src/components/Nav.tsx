import { motion } from 'motion/react'
import { NavLink, useLocation } from 'react-router-dom'
import './nav.css'

const ITEMS = [
  {
    to: '/',
    label: 'Home',
    icon: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1Z" />,
  },
  {
    to: '/collezione',
    label: 'Collezione',
    icon: (
      <>
        <rect x="4" y="5" width="9" height="13" rx="1.6" />
        <path d="M15.5 6.5 19 7.6a1.4 1.4 0 0 1 .9 1.8l-3 9.3" />
      </>
    ),
  },
  {
    to: '/mazzi',
    label: 'Mazzi',
    icon: (
      <>
        <rect x="6" y="7" width="12" height="13" rx="1.6" />
        <path d="M8 4.5h8M9.5 2.5h5" />
      </>
    ),
  },
  {
    to: '/impara',
    label: 'Impara',
    icon: (
      <>
        <path d="M4 6.5c3-1.4 5.6-1.2 8 .6 2.4-1.8 5-2 8-.6V19c-3-1.4-5.6-1.2-8 .6-2.4-1.8-5-2-8-.6Z" />
        <path d="M12 7.1v12.5" />
      </>
    ),
  },
]

export function Nav() {
  const { pathname } = useLocation()
  const activeIndex = ITEMS.findIndex((it) => (it.to === '/' ? pathname === '/' : pathname.startsWith(it.to)))
  return (
    <nav className="nav" aria-label="Sezioni">
      <span className="nav-brand" aria-hidden>
        RV
      </span>
      {ITEMS.map((it, i) => (
        <NavLink key={it.to} to={it.to} end={it.to === '/'} className="nav-item">
          {i === activeIndex && (
            <motion.span layoutId="nav-active" className="nav-active" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
          )}
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
            {it.icon}
          </svg>
          <span className="nav-label">{it.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
