import { defineConfig } from 'vite';

export default defineConfig(async () => {
  const analog = (await import('@analogjs/platform')).default;

  return {
    define: {
      'process.env': {
        NODE_ENV: JSON.stringify(process.env.NODE_ENV),
        // Add any other environment variables you need
      },
      // Fallbacks for other process references
      'process.platform': JSON.stringify('browser'),
      'process.version': JSON.stringify(''),
    },
    build: {
      target: ['es2020'],
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three'],
            // Add other large dependencies here
          }
        }
      }
    },
    plugins: [
      analog({
        ssr: false,
        static: true,
        prerender: {
          routes: [],
        },
      }),
    ],
  };
});
