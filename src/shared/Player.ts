import type { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { DataValidator } from '../server/DataValidator.ts';
import * as THREE from 'three';
import type { InventoryItem } from './InventoryItem.ts';

export type PlayerData = z.input<typeof DataValidator.playerDataSchema>;

// PlayerDelta: top-level partial updates, but inventory (when present) must be full InventoryItem[]
export type PlayerDelta = Omit<Partial<PlayerData>, 'inventory'> & { inventory?: InventoryItem[] };

export class Player {
	//server-controlled simply means the server ignores updates from the client, client can sometimes still init these values before joining.

	public position = new THREE.Vector3(0, 100, 0); //initial client spawn position, immediately updatd by server
	public velocity = new THREE.Vector3(0, 0, 0);
	public inputVelocity = new THREE.Vector3();
	public gravity = 0;
	public lookQuaternion = new THREE.Quaternion(); //actual look direction
	public id = Math.floor(Math.random() * 1000000000); //unique player id, generated on client
	public gameVersion = ''; //client game version, pulled from dist/gameVersion.json
	public name = '';
	public speed = 5; //server-controlled, default 5
	public acceleration = 100; //server-controlled, default 100
	public chatActive = false;
	public chatMsg = '';
	public latency = 1000;
	public health = 100; //server-controlled
	public protection = 1; //server-controlled
	public forced = false; //server-controlled
	public forcedAcknowledged = false;
	public inventory: InventoryItem[] = []; //server-controlled
	public heldItemIndex = 0;
	public shooting = false;
	public rightClickHeld = false;
	public idLastDamagedBy?: number = -1; //server-controlled
	public playerSpectating = -1; //server-controlled
	public gameMsgs: string[] = []; //server-controlled
	public gameMsgs2: string[] = []; //server-controlled
	public updateTimestamp?: number; //server-controlled
	public lastDamageTime?: number; //server-controlled
	public directionIndicatorVector?: THREE.Vector3 = undefined; //server-controlled
	public doPhysics: boolean = true; //server-controlled
	public thirdPerson: number = 0;

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
			// Deep-clone inventory items so server-side snapshots don't alias underlying mutable objects.
			// Without this, in-place durability mutations would also mutate the stored snapshot,
			// preventing the delta emitter from detecting changes.
			inventory: this.inventory.map((item) => ({ ...item })),
			gameMsgs: [...this.gameMsgs],
			gameMsgs2: [...this.gameMsgs2],
			position: serializableVec3(this.position),
			velocity: serializableVec3(this.velocity),
			inputVelocity: serializableVec3(this.inputVelocity),
			lookQuaternion: serializableQuaternion(this.lookQuaternion),
			directionIndicatorVector: this.directionIndicatorVector ? serializableVec3(this.directionIndicatorVector) : null,
		};
	}
}
