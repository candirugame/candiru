import * as THREE from 'three';

export class ItemRespawnPoint {
	constructor(
		public position: THREE.Vector3,
		public itemIds: number[],
		public spawnChancePerTick: number,
	) {}
}
