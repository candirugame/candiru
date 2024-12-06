import { defineConfig } from 'vite'


// https://vite.dev/config/
export default defineConfig({
  plugins: [],
  build: {
    chunkSizeWarningLimit: 1500,
  },
})
