import { RespawnPoint } from './RespawnPoint.ts';
import { ItemRespawnPoint } from './ItemRespawnPoint.ts';
import { Vector3 } from "./Vector3.ts";
import { Quaternion } from "./Quaternion.ts";

export class MapData {
    constructor(
        public name: string,
        public respawnPoints: RespawnPoint[],
        public itemRespawnPoints: ItemRespawnPoint[]
    ) {}

    static fromJSON(json: any): MapData {
        const respawnPoints = json.respawnPoints.map(
            (rp: any) =>
                new RespawnPoint(
                    new Vector3(rp.position.x, rp.position.y, rp.position.z),
                    new Quaternion(rp.quaternion.x, rp.quaternion.y, rp.quaternion.z, rp.quaternion.w)
                )
        );

        const itemRespawnPoints = json.itemRespawnPoints.map(
            (irp: any) =>
                new ItemRespawnPoint(
                    new Vector3(irp.position.x, irp.position.y, irp.position.z),
                    irp.itemId,
                    irp.spawnChancePerTick
                )
        );

        return new MapData(json.name, respawnPoints, itemRespawnPoints);
    }
}