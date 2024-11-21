const defaults = {
    // Server settings
    SERVER_PORT: '3000',
    SERVER_URL: 'https://example.com',
    SERVER_DEFAULT_MAP: 'crackhouse_1',
    SERVER_TICK_RATE: '15',

    // Player settings
    PLAYER_DISCONNECT_TIME: '5',
    PLAYER_AFK_KICK_TIME: '600',
    PLAYER_MAX_HEALTH: '100',
    PLAYER_BASE_INVENTORY: '[1,2]',

    // Health settings
    HEALTH_REGEN_DELAY: '5',
    HEALTH_REGEN_RATE: '3'
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
            url: env.SERVER_URL,
            defaultMap: env.SERVER_DEFAULT_MAP,
            tickRate: parseInt(env.SERVER_TICK_RATE)
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
        }
    };
}

const rawConfig = await updateEnvFile(defaults);
const config = parseConfig(rawConfig);
export default config;
