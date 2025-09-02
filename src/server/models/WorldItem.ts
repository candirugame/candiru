import * as THREE from 'three';

export class WorldItem {
	public id: number; //unique to each item
	public creationTimestamp: number = Date.now(); // used for server despawning

	constructor(public vector: THREE.Vector3, public itemType: number) {
		this.id = Math.floor(Math.random() * 100000) + 1;
		this.creationTimestamp = Date.now() / 1000;
	}
}
