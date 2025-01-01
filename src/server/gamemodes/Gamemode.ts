import {GameEngine} from "../GameEngine.ts";
import {Player} from "../models/Player.ts";

export abstract class Gamemode {

    constructor(protected gameEngine: GameEngine) {}

    abstract init(): void;

    abstract tick(): void;

    abstract onPeriodicCleanup(): void;

    abstract onPlayerConnect(player:Player): void;

    abstract onPlayerDisconnect(player:Player): void;

    abstract onPlayerDeath(player:Player): void;

    abstract onItemPickup(player:Player): void;



}   