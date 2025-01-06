import type { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { DataValidator } from '../server/DataValidator.ts';
import * as THREE from 'three';

export type PlayerData = z.input<typeof DataValidator.playerDataSchema>;

export class Player {
	public position = new THREE.Vector3(0, 100, 0);
	public velocity = new THREE.Vector3(0, 0, 0);
	public inputVelocity = new THREE.Vector3();
	public gravity = 0;
	public lookQuaternion = new THREE.Quaternion();
	public quaternion = new THREE.Quaternion();
	public id = Math.floor(Math.random() * 1000000000);
	public gameVersion = '';
	public name = '';
	public speed = 5;
	public acceleration = 100;
	public chatActive = false;
	public chatMsg = '';
	public latency = 1000;
	public health = 100;
	public forced = false;
	public forcedAcknowledged = false;
	public inventory: number[] = [];
	public idLastDamagedBy?: number = -1;
	public playerSpectating = -1;
	public gameMsgs: string[] = [];
	public gameMsgs2: string[] = [];
	public updateTimestamp?: number;
	public lastDamageTime?: number;

	static fromObject(data: Player): Player {
		const instance = new Player();
		Object.assign(instance, data);
		return instance;
	}

	// Gets called by Socket.IO during JSON.stringify, this will match our zod schema (PlayerData)
	toJSON(): PlayerData {
		const serializableVec3 = ({ x, y, z }: THREE.Vector3) => ({ x, y, z });
		const serializableQuaternion = ({ x, y, z, w }: THREE.Quaternion) => ({ x, y, z, w });

		return {
			...this,
			position: serializableVec3(this.position),
			velocity: serializableVec3(this.velocity),
			inputVelocity: serializableVec3(this.inputVelocity),
			lookQuaternion: serializableQuaternion(this.lookQuaternion),
			quaternion: serializableQuaternion(this.quaternion),
		};
	}
}
