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
			injectRegister: 'auto',
			devOptions: {
				// Enable dev debugging
				enabled: true,
				type: 'module',
			},
			workbox: {
				// Precache only essential files for core functionality
				globPatterns: [
					'index.html',
					'favicon.ico',
					'assets/index-*.js', 
					'assets/index-*.css',
					'style.css',
					'draco/**', // Include all draco decoder files
				],
				// Don't precache other large assets
				globIgnores: [
					'**/{models,maps}/**', // Exclude large directories
					'**/*.{png,glb,json,wasm,ttf,jpg,jpeg}', // Exclude images and other large file types
					'**/socket.io/**', // Explicitly exclude socket.io
				],
				// Don't use navigateFallback for APIs or socket.io
				navigateFallbackDenylist: [
					/^\/api\//,
					/^\/socket\.io\//,
				],
				// Socket.io should never be handled by the service worker
				runtimeCaching: [
					// First rule to completely bypass the service worker for socket.io
					{
						urlPattern: ({ url }: { url: URL }) => {
							return url.pathname.startsWith('/socket.io');
						},
						handler: 'NetworkOnly',
					},
					// Static assets
					{
						urlPattern: ({ request }: { request: Request }) => {
							return request.destination === 'style' || 
								   request.destination === 'script' || 
								   request.destination === 'font';
						},
						handler: 'CacheFirst',
						options: {
							cacheName: 'static-resources',
							expiration: {
								maxEntries: 60,
								maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
							},
							cacheableResponse: {
								statuses: [0, 200]
							},
						},
					},
					// Images
					{
						urlPattern: ({ request }: { request: Request }) => {
							return request.destination === 'image';
						},
						handler: 'CacheFirst',
						options: {
							cacheName: 'images',
							expiration: {
								maxEntries: 60,
								maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
							},
							cacheableResponse: {
								statuses: [0, 200]
							},
						},
					},
					// 3D Models and assets
					{
						urlPattern: ({ url }: { url: URL }) => {
							return /\.(glb|json|wasm)$/.test(url.pathname) ||
								   url.pathname.includes('/models/') ||
								   url.pathname.includes('/maps/');
						},
						handler: 'CacheFirst',
						options: {
							cacheName: '3d-assets',
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
							},
							cacheableResponse: {
								statuses: [0, 200]
							},
						},
					},
					// HTML navigation
					{
						urlPattern: ({ request }: { request: Request }) => {
							return request.mode === 'navigate';
						},
						handler: 'NetworkFirst',
						options: {
							cacheName: 'pages',
							expiration: {
								maxEntries: 20,
								maxAgeSeconds: 60 * 60 * 24, // 1 day
							},
							cacheableResponse: {
								statuses: [0, 200]
							},
						},
					}
				],
				skipWaiting: true,
				clientsClaim: true,
			},
			manifest: {
				name: 'Candiru',
				short_name: 'Candiru',
				theme_color: '#000000',
				icons: [
					{ src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
				],
				start_url: '/',
				display: 'standalone',
				orientation: 'portrait',
			},
			// Add draco directory explicitly to assets
			includeAssets: ['draco/**/*'],
		}) as PluginOption, // Explicitly cast to PluginOption
	],
});
