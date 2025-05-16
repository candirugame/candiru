import * as THREE from 'three';

export class WorldItem {
	public id: number;
	public creationTimestamp: number = Date.now();

	constructor(public vector: THREE.Vector3, public itemType: number) {
		this.id = Math.floor(Math.random() * 100000) + 1;
		this.creationTimestamp = Date.now() / 1000;
	}
}
