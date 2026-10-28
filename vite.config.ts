import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base relativa: l'app funziona sia in locale sia pubblicata in una sottocartella (es. GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react()],
})
