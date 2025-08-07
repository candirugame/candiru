const watcher = Deno.watchFs(['src', 'main.ts', 'public']);
let server: Deno.ChildProcess | null = null;
let timer: number | undefined;
let isBuilding = false;
let pendingRestart = false;

async function restart() {
	// If already building, just mark that we need another restart
	if (isBuilding) {
		pendingRestart = true;
		return;
	}

	isBuilding = true;
	pendingRestart = false;

	try {
		if (server) {
			console.log('🔄 Change detected');
			try {
				Deno.kill(server.pid, 'SIGTERM');
				await server.status;
			} catch (e) {
				console.log('Error killing server:', e);
			}
			server = null;
		}

		console.log('⏳ Building...');
		const buildResult = await new Deno.Command('deno', {
			args: ['task', 'build'],
			stdout: 'inherit',
			stderr: 'inherit',
		}).spawn().status;

		if (!buildResult.success) {
			console.log('❌ Build failed');
			return;
		}

		console.log('🚀 Starting server...');
		server = new Deno.Command('deno', {
			args: ['run', '--allow-read', '--allow-env', '--allow-net', '--allow-write', 'main.ts'],
			stdout: 'inherit',
			stderr: 'inherit',
		}).spawn();
	} finally {
		isBuilding = false;

		// If another restart was requested while we were building, do it now
		if (pendingRestart) {
			console.log('🔄 Processing pending restart...');
			setTimeout(() => restart(), 100);
		}
	}
}

// Initial run
await restart();

for await (const event of watcher) {
	if (!['create', 'modify', 'remove'].includes(event.kind)) continue;

	// Clear any pending timer
	if (timer) clearTimeout(timer);

	// Schedule a restart
	timer = setTimeout(async () => {
		timer = undefined;
		await restart();
	}, 400);
}
