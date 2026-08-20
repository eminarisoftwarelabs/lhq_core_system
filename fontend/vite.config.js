import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Node 22+'s own experimental global `localStorage` can shadow jsdom's
  // implementation and leave `window.localStorage` undefined; the `npm test`
  // scripts set NODE_OPTIONS=--no-experimental-webstorage to avoid that.
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'http://localhost:5173' },
    },
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
})
