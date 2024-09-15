import { defineConfig } from 'vite'
import { resolve } from 'path'
import fs from 'fs'

export default defineConfig({
    root: '.',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
            },
        },
    },
    publicDir: 'public',
    server: {
        fs: {
            allow: ['..'],
        },
    },
    plugins: [
        {
            name: 'copy-draco-files',
            generateBundle() {
                this.emitFile({
                    type: 'asset',
                    fileName: 'draco/draco_decoder.wasm',
                    source: fs.readFileSync('node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm'),
                });
                this.emitFile({
                    type: 'asset',
                    fileName: 'draco/draco_wasm_wrapper.js',
                    source: fs.readFileSync('node_modules/three/examples/jsm/libs/draco/draco_wasm_wrapper.js'),
                });
            },
        },
    ],
})
