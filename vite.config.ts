import { defineConfig } from 'vite';

export default defineConfig(async () => {
  const analog = (await import('@analogjs/platform')).default;

  return {
    build: {
      target: ['es2020'],
    },
    resolve: {
      mainFields: ['module'],
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
