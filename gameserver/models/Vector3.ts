export class Vector3 {
    constructor(public x: number, public y: number, public z: number) {}

    distanceTo(other: Vector3): number {
        return Math.sqrt(
            Math.pow(this.x - other.x, 2) +
            Math.pow(this.y - other.y, 2) +
            Math.pow(this.z - other.z, 2)
        );
    }
}