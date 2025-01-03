import { Vector3 } from "./Vector3.ts";

export interface Player {
    id: number;
    speed: number;
    acceleration: number;
    name: string;
    gameVersion: string;
    position: Vector3;
    velocity: Vector3;
    inputVelocity: Vector3;
    gravity: number;
    lookQuaternion: number[];
    quaternion: number[];
    chatActive: boolean;
    chatMsg: string;
    latency: number;
    health: number;
    forced: boolean;
    forcedAcknowledged: boolean;
    updateTimestamp?: number;
    lastDamageTime?: number;
    inventory: number[];
    idLastDamagedBy?: number;
    playerSpectating:number;
    gameMsgs:string[];
    gameMsgs2:string[];

}