import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Load env (incl. VITE_API_BASE_URL) from the repo root .env, one level up.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir: repoRoot,
  server: {
    port: 5173,
  },
})
