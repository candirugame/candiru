import * as THREE from 'three';

export interface TrajectoryHit {
	// World-space hit point
	point: THREE.Vector3;
	// World-space surface normal at the hit
	normal: THREE.Vector3;
	// The point index (1-based if generated with t = i * dt) where the segment leading to this hit ended
	index: number;
}

export class Trajectory {
	public readonly points: THREE.Vector3[];
	public readonly dt: number;
	public readonly hits: TrajectoryHit[];

	constructor(points: THREE.Vector3[], dt: number, hits?: TrajectoryHit[]) {
		this.points = points;
		this.dt = dt;
		this.hits = hits ?? [];
	}

	get length(): number {
		return this.points.length;
	}

	sample(time: number): THREE.Vector3 {
		const indexLeft = Math.floor(time / this.dt);
		const indexRight = indexLeft + 1;
		if (indexRight > this.points.length - 1) return this.points[this.points.length - 1];
		if (indexLeft < 0) return this.points[0];
		const t = (time - indexLeft * this.dt) / this.dt;
		return this.points[indexLeft].clone().lerp(this.points[indexRight].clone(), t);
	}

	getDuration(): number {
		return this.dt * this.points.length;
	}
}
