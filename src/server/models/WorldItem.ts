import * as THREE from 'three';
import { Trajectory } from '../../client/input/Trajectory.ts';

export class WorldItem {
	public id: number; //unique to each item
	public creationTimestamp: number = Date.now(); // used for server despawning

	constructor(
		public vector: THREE.Vector3,
		public itemType: number,
		public initTrajectory?: Trajectory,
		public playerIdsTrajectoryHiddenFrom?: number[],
		public durabilityOffset?: number,
	) {
		this.id = Math.floor(Math.random() * 100000) + 1;
		this.creationTimestamp = Date.now() / 1000;
	}
}
