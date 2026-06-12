import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Output into ultron_backend/ui_dist so run.py can serve it with FastAPI
    outDir: './ultron_backend/ui_dist',
    emptyOutDir: true,
  },
  server: {
    port: 8000,
    strictPort: true, // Fail if port 8000 is taken, never silently switch
    // Dev mode: proxy API and WS to the FastAPI backend on 8001
    proxy: {
      '/api': 'http://localhost:8001',
      '/ws': { target: 'ws://localhost:8001', ws: true },
    },
  },
})
