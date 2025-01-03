import { Vector3 } from './Vector3.ts';
import { Quaternion } from './Quaternion.ts';

export class RespawnPoint {
	constructor(public position: Vector3, public quaternion: Quaternion) {}
}
