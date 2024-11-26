import { Vector3 } from "./Vector3.ts";

export class WorldItem {
    public id: number;

    constructor(public vector: Vector3, public itemType: number) {
        this.id = Math.floor(Math.random() * 100000) + 1;
    }
}