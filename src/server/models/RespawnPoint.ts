import * as THREE from 'three';

export class RespawnPoint {
	constructor(public position: THREE.Vector3, public quaternion: THREE.Quaternion) {}
}
