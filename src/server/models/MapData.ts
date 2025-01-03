import { RespawnPoint } from './RespawnPoint.ts';
import { ItemRespawnPoint } from './ItemRespawnPoint.ts';
import * as THREE from 'three';

export class MapData {
	constructor(
		public name: string,
		public respawnPoints: RespawnPoint[],
		public itemRespawnPoints: ItemRespawnPoint[],
	) {}

	static fromJSON(
		json: { respawnPoints: RespawnPoint[]; itemRespawnPoints: ItemRespawnPoint[]; name: string },
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

		return new MapData(json.name, respawnPoints, itemRespawnPoints);
	}
}
