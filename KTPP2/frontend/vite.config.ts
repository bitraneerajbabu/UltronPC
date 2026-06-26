import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Output into ultron_backend/ui_dist so run.py can serve it with FastAPI
    outDir: '../backend/ultron_backend/ui_dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true, // Fail if port 5173 is taken, never silently switch
    // Dev mode: proxy API and WS to the FastAPI backend on 8000
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
})
