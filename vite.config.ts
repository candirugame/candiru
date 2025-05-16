import { defineConfig, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import analog from '@analogjs/platform';

export default defineConfig({
	define: {
		'process.env': {
			NODE_ENV: JSON.stringify(process.env.NODE_ENV),
		},
		'process.platform': JSON.stringify('browser'),
		'process.version': JSON.stringify(''),
	},
	build: {
		target: ['es2020'],
		rollupOptions: {
			output: {
				manualChunks: {
					three: ['three'],
				},
			},
		},
	},
	plugins: [
		analog({
			ssr: false,
			static: true,
			prerender: {
				routes: [],
			},
		}) as PluginOption,
		VitePWA({
			strategies: 'generateSW',
			registerType: 'autoUpdate',
			workbox: {
				maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB - adjust as needed
				globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'], // Removed model file extensions
				globIgnores: ['**/original_models/**'], // Explicitly ignore models directory
				runtimeCaching: [
					{
						urlPattern: /\/original_models\/.*\.(glb|json|wasm|ttf)/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'models-cache',
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
					{
						urlPattern: /\/.*\.(glb|json|wasm|ttf)/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'asset-cache',
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
				],
				navigateFallbackDenylist: [
					/^\/api/,
					/\.(glb|json|wasm|ttf)$/,
					/\/socket.io\//,
				],
			},
			manifest: {
				name: 'Candiru',
				short_name: 'Candiru',
				theme_color: '#000000',
				icons: [
					{ src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
				],
			},
			includeAssets: [
				'**/*.{js,css,html,ico,png,svg,woff,woff2}', // Not including models here
				'draco/**/*',
			],
		}) as PluginOption,
	],
});
