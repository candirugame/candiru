import { defineConfig } from 'vite'

export default defineConfig({
    root: '.',
    build: {
        outDir: 'dist',  // Changed from '../dist' to 'dist'
        emptyOutDir: true,
        chunkSizeWarningLimit: 1500,
    },
    publicDir: 'public',
})
