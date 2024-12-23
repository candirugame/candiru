import { Player } from "./Player.ts";

export interface DamageRequest {
    localPlayer: Player;
    targetPlayer: Player;
    damage: number;
}