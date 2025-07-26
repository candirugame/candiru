export async function clearCacheAndReload() {
	try {
		if ('serviceWorker' in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			for (const registration of registrations) {
				await registration.unregister();
				console.log('Service worker unregistered');
			}
		}

		if ('caches' in window) {
			const keys = await caches.keys();
			await Promise.all(
				keys.map((key) => {
					return caches.delete(key);
				}),
			);
			console.log('All caches cleared');
		}
	} catch (error) {
		console.error('Error clearing cache or unregistering service worker:', error);
	} finally {
		console.log('Reloading page...');
		location.reload();
	}
}
