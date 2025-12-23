import { RespawnPoint } from './RespawnPoint.ts';
import { ItemRespawnPoint } from './ItemRespawnPoint.ts';
import * as THREE from 'three';

interface Vector3JSON {
	x: number;
	y: number;
	z: number;
}

interface QuaternionJSON {
	x: number;
	y: number;
	z: number;
	w: number;
}

interface RespawnPointJSON {
	position: Vector3JSON;
	quaternion: QuaternionJSON;
}

interface ItemRespawnPointJSON {
	position: Vector3JSON;
	itemId: number;
	spawnChancePerTick?: number;
}

interface CapturePointJSON {
	position: Vector3JSON;
	scale: number;
}

interface CapturePoint {
	position: THREE.Vector3;
	scale: number;
}

interface PropSpawnJSON {
	url: string;
	position: Vector3JSON;
	quaternion?: QuaternionJSON;
	scale?: Vector3JSON;
	name?: string;
	doPhysics?: boolean;
	playersCollide?: boolean;
	health?: number;
	velocity?: Vector3JSON;
	angularVelocity?: Vector3JSON;
}

export interface PropSpawn {
	url: string;
	position: THREE.Vector3;
	quaternion: THREE.Quaternion;
	scale: THREE.Vector3;
	name?: string;
	doPhysics: boolean;
	playersCollide: boolean;
	health?: number;
	velocity?: THREE.Vector3;
	angularVelocity?: THREE.Vector3;
}

interface MapJSON {
	name: string;
	respawnPoints?: RespawnPointJSON[];
	itemRespawnPoints?: ItemRespawnPointJSON[];
	capturePoints?: CapturePointJSON[];
	props?: PropSpawnJSON[];
}

export class MapData {
	constructor(
		public name: string,
		public respawnPoints: RespawnPoint[],
		public itemRespawnPoints: ItemRespawnPoint[],
		public capturePoints: CapturePoint[] = [],
		public props: PropSpawn[] = [],
	) {}

	static fromJSON(json: MapJSON): MapData {
		const respawnPoints = (json.respawnPoints ?? []).map(
			(rp) =>
				new RespawnPoint(
					new THREE.Vector3(rp.position.x, rp.position.y, rp.position.z),
					new THREE.Quaternion(rp.quaternion.x, rp.quaternion.y, rp.quaternion.z, rp.quaternion.w),
				),
		);

		const itemRespawnPoints = (json.itemRespawnPoints ?? []).map(
			(irp) =>
				new ItemRespawnPoint(
					new THREE.Vector3(irp.position.x, irp.position.y, irp.position.z),
					irp.itemId,
					irp.spawnChancePerTick ?? 1,
				),
		);

		const capturePoints = (json.capturePoints ?? []).map(
			(cp) => ({
				position: new THREE.Vector3(cp.position.x, cp.position.y, cp.position.z),
				scale: cp.scale,
			}),
		);

		const props = (json.props ?? []).map((prop) => ({
			url: prop.url,
			position: new THREE.Vector3(prop.position.x, prop.position.y, prop.position.z),
			quaternion: prop.quaternion
				? new THREE.Quaternion(prop.quaternion.x, prop.quaternion.y, prop.quaternion.z, prop.quaternion.w)
				: new THREE.Quaternion(),
			scale: prop.scale ? new THREE.Vector3(prop.scale.x, prop.scale.y, prop.scale.z) : new THREE.Vector3(1, 1, 1),
			name: prop.name,
			doPhysics: prop.doPhysics ?? true,
			playersCollide: prop.playersCollide ?? true,
			health: prop.health,
			velocity: prop.velocity ? new THREE.Vector3(prop.velocity.x, prop.velocity.y, prop.velocity.z) : undefined,
			angularVelocity: prop.angularVelocity
				? new THREE.Vector3(prop.angularVelocity.x, prop.angularVelocity.y, prop.angularVelocity.z)
				: undefined,
		}));

		return new MapData(json.name, respawnPoints, itemRespawnPoints, capturePoints, props);
	}
}
