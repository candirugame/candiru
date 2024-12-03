/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from "@analogjs/platform";
import deno from "npm:@deno/vite-plugin";

export default defineConfig(({ mode }) => ({
  build: {
    target: ['es2020'],
    chunkSizeWarningLimit: 1500,
    outDir: 'dist',
    ssrManifest: true
  },
  resolve: {
    mainFields: ['module']
  },
  plugins: [deno(), analog()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['**/*.spec.ts'],
    reporters: ['default']
  },
  define: {
    'import.meta.vitest': mode !== 'production'
  }
}));
