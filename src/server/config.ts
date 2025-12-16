import { InventoryItem } from '../shared/InventoryItem.ts';

const defaults = {
	// Server settings
	PORT: '3000',
	SERVER_HOSTNAME: '0.0.0.0',
	SERVER_NAME: 'my-server',
	SERVER_URL: 'https://example.com',
	SERVER_DEFAULT_MAP: 'crackhouse_1',
	SERVER_TICK_RATE: '24',
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
	MIN_PLAYERS_TO_START: '2',

	// Health settings
	HEALTH_REGEN_DELAY: '6',
	HEALTH_REGEN_RATE: '5',

	//Item settings
	MAX_ITEMS_IN_WORLD: '14',
	ITEM_RESPAWN_TIME: '5',
	ITEM_DESPAWN_TIME: '300', //5 minutes, set to 0 to disable
	ITEM_SHOTS_DO_DURABILITY: 'false',
	ITEM_ROT_TAKES_DURABILITY: 'false',

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
const numberOr = (value: string | undefined, fallback: number): number => {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isNaN(parsed) ? fallback : parsed;
};

const boolOr = (value: string | undefined, fallback: string): boolean => {
	return (value ?? fallback).toLowerCase() === 'true';
};

function parseConfig(env: Record<string, string>) {
	return {
		server: {
			port: numberOr(env.PORT, parseInt(defaults.PORT, 10)),
			hostname: env.SERVER_HOSTNAME || defaults.SERVER_HOSTNAME,
			name: env.SERVER_NAME,
			url: env.DOKPLOY_DEPLOY_URL ? 'https://' + env.DOKPLOY_DEPLOY_URL : env.SERVER_URL,
			defaultMap: env.SERVER_DEFAULT_MAP,
			tickRate: numberOr(env.SERVER_TICK_RATE, parseInt(defaults.SERVER_TICK_RATE, 10)),
			cleanupInterval: numberOr(env.SERVER_CLEANUP_INTERVAL, parseInt(defaults.SERVER_CLEANUP_INTERVAL, 10)),
			fullPlayerEmitInterval: numberOr(env.FULL_PLAYER_EMIT_INTERVAL, parseInt(defaults.FULL_PLAYER_EMIT_INTERVAL, 10)),
		},
		peer: {
			updateInterval: numberOr(env.PEER_UPDATE_TICK_INTERVAL, parseInt(defaults.PEER_UPDATE_TICK_INTERVAL, 10)),
			shareInterval: numberOr(env.PEER_SHARE_INTERVAL, parseInt(defaults.PEER_SHARE_INTERVAL, 10)),
			maxFailedAttempts: numberOr(env.PEER_MAX_FAILED_ATTEMPTS, parseInt(defaults.PEER_MAX_FAILED_ATTEMPTS, 10)),
			staleThreshold: numberOr(env.PEER_STALE_THRESHOLD, parseInt(defaults.PEER_STALE_THRESHOLD, 10)),
			maxServers: numberOr(env.PEER_MAX_SERVERS, parseInt(defaults.PEER_MAX_SERVERS, 10)),
			healthcheckRetries: numberOr(env.PEER_HEALTHCHECK_RETRIES, parseInt(defaults.PEER_HEALTHCHECK_RETRIES, 10)),
			healthcheckInterval: numberOr(env.PEER_HEALTHCHECK_INTERVAL, parseInt(defaults.PEER_HEALTHCHECK_INTERVAL, 10)),
			urlFailureForgetTime: numberOr(
				env.PEER_URL_FAILURE_FORGET_TIME,
				parseInt(defaults.PEER_URL_FAILURE_FORGET_TIME, 10),
			),
			verifiedDomains: env.PEER_VERIFIED_DOMAINS
				? env.PEER_VERIFIED_DOMAINS.split(',').map((domain) => domain.trim())
				: [],
		},
		game: {
			mode: env.GAME_MODE,
			maxPlayers: numberOr(env.GAME_MAX_PLAYERS, parseInt(defaults.GAME_MAX_PLAYERS, 10)),
			respawnDelay: numberOr(env.RESPAWN_DELAY, parseInt(defaults.RESPAWN_DELAY, 10)),
			pointsToWin: numberOr(env.POINTS_TO_WIN, parseInt(defaults.POINTS_TO_WIN, 10)),
			pointsToEvent: numberOr(env.POINTS_TO_EVENT, parseInt(defaults.POINTS_TO_EVENT, 10)),
			minPlayersToStart: numberOr(env.MIN_PLAYERS_TO_START, parseInt(defaults.MIN_PLAYERS_TO_START, 10)),
		},
		player: {
			disconnectTime: numberOr(env.PLAYER_DISCONNECT_TIME, parseInt(defaults.PLAYER_DISCONNECT_TIME, 10)),
			afkKickTime: numberOr(env.PLAYER_AFK_KICK_TIME, parseInt(defaults.PLAYER_AFK_KICK_TIME, 10)),
			maxHealth: numberOr(env.PLAYER_MAX_HEALTH, parseInt(defaults.PLAYER_MAX_HEALTH, 10)),
			baseInventory: JSON.parse(env.PLAYER_BASE_INVENTORY ?? defaults.PLAYER_BASE_INVENTORY) as InventoryItem[],
		},
		health: {
			regenDelay: numberOr(env.HEALTH_REGEN_DELAY, parseInt(defaults.HEALTH_REGEN_DELAY, 10)),
			regenRate: numberOr(env.HEALTH_REGEN_RATE, parseInt(defaults.HEALTH_REGEN_RATE, 10)),
		},
		items: {
			maxItemsInWorld: numberOr(env.MAX_ITEMS_IN_WORLD, parseInt(defaults.MAX_ITEMS_IN_WORLD, 10)),
			respawnTime: numberOr(env.ITEM_RESPAWN_TIME, parseInt(defaults.ITEM_RESPAWN_TIME, 10)),
			despawnTime: numberOr(env.ITEM_DESPAWN_TIME, parseInt(defaults.ITEM_DESPAWN_TIME, 10)),
			shotsTakeDurability: boolOr(env.ITEM_SHOTS_DO_DURABILITY, defaults.ITEM_SHOTS_DO_DURABILITY),
			rotTakesDurability: boolOr(env.ITEM_ROT_TAKES_DURABILITY, defaults.ITEM_ROT_TAKES_DURABILITY),
		},
		dev: {
			appendClientHashToVersion: env.APPEND_CLIENT_HASH_TO_VERSION === 'true',
		},
	};
}

const rawConfig = await updateEnvFile(defaults);
const config = parseConfig(rawConfig);
export default config;
