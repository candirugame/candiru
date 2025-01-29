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
	public skyColor: string;
	public tickComputeTime: number = 0;
	public cleanupComputeTime: number = 0;
	public url: string;
	constructor() {
		this.name = config.server.name;
		this.maxPlayers = config.game.maxPlayers;
		this.mapName = config.server.defaultMap;
		this.tickRate = config.server.tickRate;
		this.gameMode = config.game.mode;
		this.playerMaxHealth = config.player.maxHealth;
		this.skyColor = '#000000';
		this.tickComputeTime = 0;
		this.cleanupComputeTime = 0;
		this.url = config.server.url;
	}
	toJSON() {
		return {
			...this,
		};
	}
}
