import * as THREE from 'three';

export class WorldItem {
	public id: number;

	constructor(public vector: THREE.Vector3, public itemType: number) {
		this.id = Math.floor(Math.random() * 100000) + 1;
	}
}
