const defaults = {
	// Server settings
	PORT: '3000',
	SERVER_HOSTNAME: '0.0.0.0',
	SERVER_NAME: 'my-server',
	SERVER_URL: 'https://example.com',
	SERVER_DEFAULT_MAP: 'crackhouse_1',
	SERVER_TICK_RATE: '15',
	SERVER_CLEANUP_INTERVAL: '1000',
	FULL_PLAYER_EMIT_INTERVAL: '5000', //send full player data every 5 seconds

	// Peer settings
	PEER_UPDATE_TICK_INTERVAL: '1', //update a stale peer from queue every x seconds
	PEER_SHARE_INTERVAL: '300', //share peer list every 5 minutes
	PEER_MAX_FAILED_ATTEMPTS: '5',
	PEER_STALE_THRESHOLD: '120', //check peers every 2 minutes
	PEER_MAX_SERVERS: '200', //max servers to keep track of in memory
	PEER_HEALTHCHECK_RETRIES: '10',
	PEER_HEALTHCHECK_INTERVAL: '30',
	PEER_URL_FAILURE_FORGET_TIME: '7200', //forget failed urls after 2 hours
	PEER_VERIFIED_DOMAINS: 'candiru.xyz,isaacthoman.com,napst.xyz,deathgrips.org', //comma-separated list of domains to verify

	// Player settings
	PLAYER_DISCONNECT_TIME: '10',
	PLAYER_AFK_KICK_TIME: '600',
	PLAYER_MAX_HEALTH: '100',
	PLAYER_BASE_INVENTORY: '[]',

	//Game settings
	GAME_MODE: 'ffa',
	GAME_MAX_PLAYERS: '20',
	RESPAWN_DELAY: '10',
	POINTS_TO_WIN: '100',
	POINTS_TO_EVENT: '30',

	// Health settings
	HEALTH_REGEN_DELAY: '6',
	HEALTH_REGEN_RATE: '5',

	//Item settings
	MAX_ITEMS_IN_WORLD: '14',
	ITEM_RESPAWN_TIME: '5',
	ITEM_DESPAWN_TIME: '300', //5 minutes, set to 0 to disable

	//platform-specific settings
	DOKPLOY_DEPLOY_URL: '',
	APPEND_CLIENT_HASH_TO_VERSION: 'false',
};

async function updateEnvFile(defaults: Record<string, string>) {
	const envPath = '.env';
	const envExists = await Deno.stat(envPath).catch(() => false);
	let currentEnvFromFile: Record<string, string> = {};

	if (envExists) {
		const content = await Deno.readTextFile(envPath);
		currentEnvFromFile = content.split('\n')
			.filter((line) => line && !line.startsWith('#'))
			.reduce((acc, line) => {
				const eqIndex = line.indexOf('=');
				if (eqIndex === -1) return acc; // Skip lines without '='
				const key = line.slice(0, eqIndex).trim();
				let value = line.slice(eqIndex + 1).trim();
				// Remove surrounding quotes if present
				if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
					value = value.slice(1, -1);
				}
				acc[key] = value;
				return acc;
			}, {} as Record<string, string>);
	}

	// Get system environment variables
	const systemEnv = Deno.env.toObject();

	// Merge sources: defaults < .env file < system env
	const finalEnv = {
		...defaults,
		...currentEnvFromFile,
		...systemEnv, // System env vars override others
	};

	// Keep only keys present in the original defaults or systemEnv
	// This prevents arbitrary env vars from polluting the config
	const filteredFinalEnv: Record<string, string> = {};
	for (const key in finalEnv) {
		if (key in defaults) {
			filteredFinalEnv[key] = finalEnv[key];
		}
	}

	// Write the final effective configuration back to .env (optional but can be helpful for debugging)
	const envContent = Object.entries(filteredFinalEnv)
		.map(([key, value]) => `${key}=${value}`)
		.join('\n');

	await Deno.writeTextFile(envPath, envContent);
	return filteredFinalEnv; // Return the final, merged config
}

// Parse specific types from string values
function parseConfig(env: Record<string, string>) {
	return {
		server: {
			port: parseInt(env.PORT),
			hostname: env.SERVER_HOSTNAME,
			name: env.SERVER_NAME,
			url: env.DOKPLOY_DEPLOY_URL ? 'https://' + env.DOKPLOY_DEPLOY_URL : env.SERVER_URL,
			defaultMap: env.SERVER_DEFAULT_MAP,
			tickRate: parseInt(env.SERVER_TICK_RATE),
			cleanupInterval: parseInt(env.SERVER_CLEANUP_INTERVAL),
			fullPlayerEmitInterval: parseInt(env.FULL_PLAYER_EMIT_INTERVAL),
		},
		peer: {
			updateInterval: parseInt(env.PEER_UPDATE_TICK_INTERVAL),
			shareInterval: parseInt(env.PEER_SHARE_INTERVAL),
			maxFailedAttempts: parseInt(env.PEER_MAX_FAILED_ATTEMPTS),
			staleThreshold: parseInt(env.PEER_STALE_THRESHOLD),
			maxServers: parseInt(env.PEER_MAX_SERVERS),
			healthcheckRetries: parseInt(env.PEER_HEALTHCHECK_RETRIES),
			healthcheckInterval: parseInt(env.PEER_HEALTHCHECK_INTERVAL),
			urlFailureForgetTime: parseInt(env.PEER_URL_FAILURE_FORGET_TIME),
			verifiedDomains: env.PEER_VERIFIED_DOMAINS
				? env.PEER_VERIFIED_DOMAINS.split(',').map((domain) => domain.trim())
				: [],
		},
		game: {
			mode: env.GAME_MODE,
			maxPlayers: parseInt(env.GAME_MAX_PLAYERS),
			respawnDelay: parseInt(env.RESPAWN_DELAY),
			pointsToWin: parseInt(env.POINTS_TO_WIN),
			pointsToEvent: parseInt(env.POINTS_TO_EVENT),
		},
		player: {
			disconnectTime: parseInt(env.PLAYER_DISCONNECT_TIME),
			afkKickTime: parseInt(env.PLAYER_AFK_KICK_TIME),
			maxHealth: parseInt(env.PLAYER_MAX_HEALTH),
			baseInventory: JSON.parse(env.PLAYER_BASE_INVENTORY) as number[],
		},
		health: {
			regenDelay: parseInt(env.HEALTH_REGEN_DELAY),
			regenRate: parseInt(env.HEALTH_REGEN_RATE),
		},
		items: {
			maxItemsInWorld: parseInt(env.MAX_ITEMS_IN_WORLD),
			respawnTime: parseInt(env.ITEM_RESPAWN_TIME),
			despawnTime: parseInt(env.ITEM_DESPAWN_TIME),
		},
		dev: {
			appendClientHashToVersion: env.APPEND_CLIENT_HASH_TO_VERSION === 'true',
		},
	};
}

const rawConfig = await updateEnvFile(defaults);
const config = parseConfig(rawConfig);
export default config;
