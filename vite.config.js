import { defineConfig } from 'vite'

export default defineConfig({
    root: '.',
    build: {
        outDir: 'dist',  // Changed from '../dist' to 'dist'
        emptyOutDir: true,
    },
    publicDir: 'public',
})
