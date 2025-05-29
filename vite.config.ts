import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7002,
    host: 'localhost',
    https: true,
    strictPort: true
  },
  build: {
    outDir: "dist"
  }
});