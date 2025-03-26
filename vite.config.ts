import { defineConfig, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import analog from '@analogjs/platform';

export default defineConfig({
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
		}) as PluginOption, // Explicitly cast to PluginOption
		VitePWA({
			strategies: 'generateSW',
			registerType: 'autoUpdate',
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,glb,json,wasm,ttf}'],
				runtimeCaching: [
					// Removed socket.io rule to avoid intercepting WebSocket traffic
					{
						urlPattern: /\/.*\.(glb|json|wasm|ttf)/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'asset-cache',
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
							},
						},
					},
				],
				navigateFallbackDenylist: [
					/^\/api/,
					/\.(glb|json|wasm|ttf)$/,
					/\/socket.io\//, // Added socket.io to denylist to prevent service worker interference
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
				'**/*.{glb,json,wasm,ttf}',
				'draco/**/*', // Explicitly include Draco files
			],
		}) as PluginOption, // Explicitly cast to PluginOption
	],
});
