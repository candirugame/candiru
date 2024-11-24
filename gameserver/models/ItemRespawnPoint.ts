import { Vector3 } from './Vector3.ts';

export class ItemRespawnPoint {
    constructor(
        public position: Vector3,
        public itemId: number,
        public spawnChancePerTick: number
    ) {}
}