import type { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import { DataValidator } from '../server/DataValidator.ts';
import * as THREE from 'three';

export type PropData = z.input<typeof DataValidator.propDataSchema>;

export class Prop {
	public url: string = '/models/simplified_possum.glb'; //default model
	public position = new THREE.Vector3(0, 0, 0);
	public velocity = new THREE.Vector3(0, 0, 0);
	public quaternion = new THREE.Quaternion();
	public scale = new THREE.Vector3(1, 1, 1);
	public id = Math.floor(Math.random() * 1000000000); //unique id
	public name = '';
	public doPhysics: boolean = true;
	public playersCollide: boolean = true;

	constructor(url?: string, position?: THREE.Vector3, quaternion?: THREE.Quaternion, scale?: THREE.Vector3) {
		if (url) this.url = url;
		if (position) this.position = position;
		if (quaternion) this.quaternion = quaternion;
		if (scale) this.scale = scale;
	}

	static fromObject(data: Prop): Prop {
		const instance = new Prop(data.url);
		Object.assign(instance, data);
		return instance;
	}

	// Gets called by Socket.IO during JSON.stringify, this will match our zod schema (PlayerData)
	toJSON(): PropData {
		const serializableVec3 = ({ x, y, z }: THREE.Vector3) => ({ x, y, z });
		const serializableQuaternion = ({ x, y, z, w }: THREE.Quaternion) => ({ x, y, z, w });

		return {
			...this,
			position: serializableVec3(this.position),
			velocity: serializableVec3(this.velocity),
			quaternion: serializableQuaternion(this.quaternion),
			scale: serializableVec3(this.scale),
		};
	}
}
