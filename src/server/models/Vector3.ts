export class Vector3 {
	constructor(public x: number, public y: number, public z: number) {}
	public distanceTo(other: Vector3): number {
		return Math.sqrt(
			Math.pow(this.x - other.x, 2) +
				Math.pow(this.y - other.y, 2) +
				Math.pow(this.z - other.z, 2),
		);
	}

	public static distanceTo(v1: Vector3, v2: Vector3): number {
		return Math.sqrt(
			Math.pow(v1.x - v2.x, 2) +
				Math.pow(v1.y - v2.y, 2) +
				Math.pow(v1.z - v2.z, 2),
		);
	}
}
