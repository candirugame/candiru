import type { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { DataValidator } from '../server/DataValidator.ts';
import * as THREE from 'three';

export type PlayerData = z.input<typeof DataValidator.playerDataSchema>;

// All public class fields as an object without functions
// deno-lint-ignore ban-types
type PlayerFields = { [K in keyof Player as Player[K] extends Function ? never : K]: Player[K] };

export class Player {
	public position: THREE.Vector3;
	public velocity: THREE.Vector3;
	public inputVelocity: THREE.Vector3;
	public gravity: number;
	public lookQuaternion: THREE.Quaternion;
	public quaternion: THREE.Quaternion;
	public id: number;
	public gameVersion: string;
	public name: string;
	public speed: number;
	public acceleration: number;
	public chatActive: boolean;
	public chatMsg: string;
	public latency: number;
	public health: number;
	public forced: boolean;
	public forcedAcknowledged: boolean;
	public inventory: number[];
	public idLastDamagedBy?: number;
	public playerSpectating: number;
	public gameMsgs: string[];
	public gameMsgs2: string[];
	public updateTimestamp?: number;
	public lastDamageTime?: number;

	constructor() {
		this.position = new THREE.Vector3(0, 100, 0);
		this.velocity = new THREE.Vector3(0, 0, 0);
		this.inputVelocity = new THREE.Vector3();
		this.gravity = 0;
		this.lookQuaternion = new THREE.Quaternion();
		this.quaternion = new THREE.Quaternion();
		this.id = Math.floor(Math.random() * 1000000000);
		this.gameVersion = '';
		this.name = '';
		this.speed = 5;
		this.acceleration = 100;
		this.chatActive = false;
		this.chatMsg = '';
		this.latency = 1000;
		this.health = 100;
		this.forced = false;
		this.forcedAcknowledged = false;
		this.inventory = [];
		this.idLastDamagedBy = -1;
		this.playerSpectating = -1;
		this.gameMsgs = [];
		this.gameMsgs2 = [];
		this.updateTimestamp = undefined;
		this.lastDamageTime = undefined;
	}

	static fromObject(data: PlayerFields) {
		const instance = new Player();
		Object.assign(instance, data);

		return instance;
	}

	// Gets called by Socket.IO during JSON.stringify, this will match our zod schema (PlayerData)
	toJSON(): PlayerData {
		const serializableVec3 = ({ x, y, z }: THREE.Vector3) => ({
			x,
			y,
			z,
		});

		const serializableQuaternion = ({ x, y, z, w }: THREE.Quaternion) => ({
			x,
			y,
			z,
			w,
		});

		return {
			id: this.id,
			speed: this.speed,
			acceleration: this.acceleration,
			name: this.name,
			gameVersion: this.gameVersion,
			position: serializableVec3(this.position),
			velocity: serializableVec3(this.velocity),
			inputVelocity: serializableVec3(this.inputVelocity),
			gravity: this.gravity,
			lookQuaternion: serializableQuaternion(this.lookQuaternion),
			quaternion: serializableQuaternion(this.quaternion),
			chatActive: this.chatActive,
			chatMsg: this.chatMsg,
			latency: this.latency,
			health: this.health,
			forced: this.forced,
			forcedAcknowledged: this.forcedAcknowledged,
			inventory: this.inventory,
			idLastDamagedBy: this.idLastDamagedBy,
			playerSpectating: this.playerSpectating,
			gameMsgs: this.gameMsgs,
			gameMsgs2: this.gameMsgs2,
			updateTimestamp: this.updateTimestamp,
			lastDamageTime: this.lastDamageTime,
		};
	}
}
