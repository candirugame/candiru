const defaults = {
    // Server settings
    SERVER_PORT: '3000',
    SERVER_NAME: 'my-server',
    SERVER_URL: 'https://example.com',
    SERVER_DEFAULT_MAP: 'crackhouse_1',
    SERVER_TICK_RATE: '15',
    SERVER_CLEANUP_INTERVAL: '2000',

    // Player settings
    PLAYER_DISCONNECT_TIME: '8',
    PLAYER_AFK_KICK_TIME: '600',
    PLAYER_MAX_HEALTH: '100',
    PLAYER_BASE_INVENTORY: '[]',

    //Game settings
    GAME_MODE: 'ffa',
    GAME_MAX_PLAYERS: '20',

    // Health settings
    HEALTH_REGEN_DELAY: '5',
    HEALTH_REGEN_RATE: '3',

    //Item settings
    MAX_ITEMS_IN_WORLD: '7',
    ITEM_RESPAWN_TIME: '10',
};

async function updateEnvFile(defaults: Record<string, string>) {
    const envPath = '.env';
    const envExists = await Deno.stat(envPath).catch(() => false);
    let currentEnv: Record<string, string> = {};

    if (envExists) {
        const content = await Deno.readTextFile(envPath);
        currentEnv = content.split('\n')
            .filter(line => line && !line.startsWith('#'))
            .reduce((acc, line) => {
                const [key, value] = line.split('=').map(s => s.trim());
                acc[key] = value.replace(/["']/g, '');
                return acc;
            }, {} as Record<string, string>);
    }

    const finalEnv = {
        ...defaults,
        ...currentEnv
    };


    const envContent = Object.entries(finalEnv)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    await Deno.writeTextFile(envPath, envContent);
    return finalEnv;
}

// Parse specific types from string values
function parseConfig(env: Record<string, string>) {
    return {
        server: {
            port: parseInt(env.SERVER_PORT),
            name: env.SERVER_NAME,
            url: env.SERVER_URL,
            defaultMap: env.SERVER_DEFAULT_MAP,
            tickRate: parseInt(env.SERVER_TICK_RATE),
            cleanupInterval: parseInt(env.SERVER_CLEANUP_INTERVAL)
        },
        game: {
            mode: env.GAME_MODE,
            maxPlayers: parseInt(env.GAME_MAX_PLAYERS)
        },
        player: {
            disconnectTime: parseInt(env.PLAYER_DISCONNECT_TIME),
            afkKickTime: parseInt(env.PLAYER_AFK_KICK_TIME),
            maxHealth: parseInt(env.PLAYER_MAX_HEALTH),
            baseInventory: JSON.parse(env.PLAYER_BASE_INVENTORY) as number[]
        },
        health: {
            regenDelay: parseInt(env.HEALTH_REGEN_DELAY),
            regenRate: parseInt(env.HEALTH_REGEN_RATE)
        },
        items: {
            maxItemsInWorld: parseInt(env.MAX_ITEMS_IN_WORLD),
            respawnTime: parseInt(env.ITEM_RESPAWN_TIME)
        }
    };
}

const rawConfig = await updateEnvFile(defaults);
const config = parseConfig(rawConfig);
export default config;
