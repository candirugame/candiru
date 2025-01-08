import config from '../config.ts';
import * as THREE from 'three';

export class ServerInfo {
	public name: string;
	public maxPlayers: number;
	public currentPlayers: number = 0;
	public mapName: string;
	public tickRate: number;
	public version: string = '';
	public gameMode: string;
	public playerMaxHealth: number;
	public highlightedVectors: THREE.Vector3[] = []; //new THREE.Vector3(5.92, 1.21, -4.10)
	public directionIndicatorVector?: THREE.Vector3 = undefined;
	constructor() {
		this.name = config.server.name;
		this.maxPlayers = config.game.maxPlayers;
		this.mapName = config.server.defaultMap;
		this.tickRate = config.server.tickRate;
		this.gameMode = config.game.mode;
		this.playerMaxHealth = config.player.maxHealth;
	}
	toJSON() {
		const serializableVec3 = ({ x, y, z }: THREE.Vector3) => ({ x, y, z });

		return {
			...this,
			highlightedVectors: this.highlightedVectors.map(serializableVec3),
			directionIndicatorVector: this.directionIndicatorVector ? serializableVec3(this.directionIndicatorVector) : null,
		};
	}
}
