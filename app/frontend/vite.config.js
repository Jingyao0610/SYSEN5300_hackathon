import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// base './' makes every asset path relative, so the built dist/ works at any
// URL - including a Posit Connect content path like /content/<guid>/.
export default defineConfig({
  plugins: [react()],
  base: './',
  // examples.js imports the CSVs in ../../data (H-02); let the dev server read the repo
  server: { fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
