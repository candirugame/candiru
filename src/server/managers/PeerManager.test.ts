Deno.test('PeerManager starts after healthcheck and discovers configured peers', async () => {
	const originalCwd = Deno.cwd();
	const originalEnv = Deno.env.toObject();
	const tempDir = await Deno.makeTempDir();
	const selfPort = getOpenPort();
	const peerPort = getOpenPort();
	const selfUrl = `http://127.0.0.1:${selfPort}`;
	const peerUrl = `http://127.0.0.1:${peerPort}`;
	const selfAbort = new AbortController();
	const peerAbort = new AbortController();

	try {
		Deno.chdir(tempDir);
		Deno.env.set('SERVER_URL', selfUrl);
		Deno.env.set('SERVER_NAME', 'self-test');
		Deno.env.set('SERVER_DEFAULT_MAP', 'crackhouse_1');
		Deno.env.set('GAME_MODE', 'bridge');
		Deno.env.set('PEER_HEALTHCHECK_RETRIES', '1');
		Deno.env.set('PEER_HEALTHCHECK_INTERVAL', '0');
		Deno.env.set('PEER_UPDATE_TICK_INTERVAL', '1');
		Deno.env.set('PEER_STALE_THRESHOLD', '1');

		const { PeerManager } = await import('./PeerManager.ts');
		const manager = new PeerManager({ serversFilePath: `${tempDir}/servers.txt` });
		let peerInfoRequests = 0;
		await Deno.writeTextFile(`${tempDir}/servers.txt`, `${peerUrl}/\n${selfUrl}/\nnot-a-url\n`);

		const selfServer = Deno.serve(
			{
				hostname: '127.0.0.1',
				port: selfPort,
				signal: selfAbort.signal,
				onListen: () => undefined,
			},
			(request) => {
				const url = new URL(request.url);
				if (
					url.pathname === '/api/healthcheck' &&
					request.headers.get('X-Health-Secret') === manager.healthSecret
				) {
					return new Response(null, { status: 200 });
				}

				return new Response(null, { status: 404 });
			},
		);

		const peerServer = Deno.serve(
			{
				hostname: '127.0.0.1',
				port: peerPort,
				signal: peerAbort.signal,
				onListen: () => undefined,
			},
			(request) => {
				const url = new URL(request.url);
				if (url.pathname !== '/api/getInfo') {
					return new Response(null, { status: 404 });
				}

				peerInfoRequests++;
				if (peerInfoRequests === 1) {
					return new Response(null, { status: 503 });
				}

				return Response.json({
					name: 'peer-test',
					maxPlayers: 20,
					currentPlayers: 0,
					mapName: 'crackhouse_1',
					tickRate: 24,
					version: 'test',
					gameMode: 'ffa',
					playerMaxHealth: 100,
					skyColor: '#000000',
					tickComputeTime: 0,
					cleanupComputeTime: 0,
					url: peerUrl,
					memUsageRss: 0,
					memUsageHeapUsed: 0,
					memUsageHeapTotal: 0,
					memUsageExternal: 0,
					idleKickTime: 600,
					durabilityEnabled: false,
				});
			},
		);

		try {
			await manager.start();
			await waitFor(() => manager.peers.some((peer) => peer.url === peerUrl && peer.serverInfo?.name === 'peer-test'));

			if (manager.peers.length !== 1) {
				throw new Error(`Expected one discovered peer, got ${manager.peers.length}`);
			}
			if (peerInfoRequests < 2) {
				throw new Error(`Expected peer info to be retried, got ${peerInfoRequests} request`);
			}
		} finally {
			manager.shutdown();
			selfAbort.abort();
			peerAbort.abort();
			await Promise.allSettled([selfServer.finished, peerServer.finished]);
		}
	} finally {
		Deno.chdir(originalCwd);
		restoreEnv(originalEnv);
		await Deno.remove(tempDir, { recursive: true });
	}
});

function getOpenPort() {
	const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
	const port = (listener.addr as Deno.NetAddr).port;
	listener.close();
	return port;
}

async function waitFor(predicate: () => boolean) {
	const deadline = Date.now() + 3000;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}

	throw new Error('Timed out waiting for condition');
}

function restoreEnv(originalEnv: Record<string, string>) {
	for (const key of Object.keys(Deno.env.toObject())) {
		if (!(key in originalEnv)) {
			Deno.env.delete(key);
		}
	}

	for (const [key, value] of Object.entries(originalEnv)) {
		Deno.env.set(key, value);
	}
}
