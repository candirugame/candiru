import { RespawnPoint } from './RespawnPoint.ts';
import { ItemRespawnPoint } from './ItemRespawnPoint.ts';
import * as THREE from 'three';

interface CapturePoint {
	position: THREE.Vector3;
	scale: number;
}

export class MapData {
	constructor(
		public name: string,
		public respawnPoints: RespawnPoint[],
		public itemRespawnPoints: ItemRespawnPoint[],
		public capturePoints: CapturePoint[] = [],
	) {}

	static fromJSON(
		json: {
			capturePoints: any;
			respawnPoints: RespawnPoint[];
			itemRespawnPoints: ItemRespawnPoint[];
			name: string;
		},
	): MapData {
		const respawnPoints = json.respawnPoints.map(
			(rp) =>
				new RespawnPoint(
					new THREE.Vector3(rp.position.x, rp.position.y, rp.position.z),
					new THREE.Quaternion(rp.quaternion.x, rp.quaternion.y, rp.quaternion.z, rp.quaternion.w),
				),
		);

		const itemRespawnPoints = json.itemRespawnPoints.map(
			(irp) =>
				new ItemRespawnPoint(
					new THREE.Vector3(irp.position.x, irp.position.y, irp.position.z),
					irp.itemId,
					irp.spawnChancePerTick,
				),
		);

		const capturePoints = json.capturePoints.map(
			(cp: { position: { x: number; y: number; z: number }; scale?: number }) => ({
				position: new THREE.Vector3(cp.position.x, cp.position.y, cp.position.z),
				scale: cp.scale,
			}),
		);

		return new MapData(json.name, respawnPoints, itemRespawnPoints, capturePoints);
	}
}
