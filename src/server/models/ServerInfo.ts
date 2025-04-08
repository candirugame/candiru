import config from '../config.ts';

export class ServerInfo {
	public name: string;
	public maxPlayers: number;
	public currentPlayers: number = 0;
	public mapName: string;
	public tickRate: number;
	public version: string = '';
	public gameMode: string;
	public playerMaxHealth: number;
	public skyColor: string = '#000000';
	public tickComputeTime: number = 0;
	public cleanupComputeTime: number = 0;
	public url: string;
	public memUsage: number = 0;
	public heapTotal: number = 0;
	public heapUsed: number = 0;
	public external: number = 0;
	public idleKickTime: number;
	constructor() {
		this.name = config.server.name;
		this.maxPlayers = config.game.maxPlayers;
		this.mapName = config.server.defaultMap;
		this.tickRate = config.server.tickRate;
		this.gameMode = config.game.mode;
		this.playerMaxHealth = config.player.maxHealth;
		this.url = config.server.url;
		this.idleKickTime = config.player.afkKickTime;
	}
	toJSON() {
		return {
			...this,
		};
	}
}
