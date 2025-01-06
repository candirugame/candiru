import * as THREE from 'three';

export class ItemRespawnPoint {
	constructor(
		public position: THREE.Vector3,
		public itemId: number,
		public spawnChancePerTick: number,
	) {}
}
