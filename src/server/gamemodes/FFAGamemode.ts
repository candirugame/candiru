import {GameEngine} from "../GameEngine.ts";
import {Player} from "../models/Player.ts";
import {Gamemode} from "./Gamemode.ts";
import config from "../config.ts";


export class FFAGamemode extends Gamemode {

    private spectateTimeouts: Map<Player,number> = new Map();
    constructor(gameEngine: GameEngine) {
        super(gameEngine);
        this.init();
    }

    init(): void {
        console.log('🐙 FFA Gamemode initialized');
    }

    tick(): void {
        const currentTime = Date.now() / 1000;
        for (const [player, timestamp] of this.spectateTimeouts) {
            if (currentTime - timestamp > 10) {
                this.gameEngine.playerManager.respawnPlayer(player);
                player.playerSpectating = -1;
                this.spectateTimeouts.delete(player);
                this.gameEngine.setGameMessage(player, '', 0);
            }else{
                this.gameEngine.setGameMessage(player, '&crespawn in ' + Math.floor(10 + timestamp - currentTime)+ ' seconds', 1, 0.5);
            }
            player.health = config.player.maxHealth;


        }
    }

    onPeriodicCleanup(): void {

    }

    onPlayerConnect(_player: Player): void {
    }

    onPlayerDisconnect(_player: Player): void {
    }

    onPlayerDeath(player: Player): void {
        if (player.lastDamageTime && player.idLastDamagedBy &&
            Date.now() / 1000 - player.lastDamageTime < 5) {
            const killer = this.gameEngine.playerManager.getPlayerById(player.idLastDamagedBy);
            if (killer) {
                // Redirect spectators of the dead player to the killer
                for (const otherPlayer of this.gameEngine.playerManager.getAllPlayers()) {
                    if (otherPlayer.playerSpectating === player.id) {
                        otherPlayer.playerSpectating = killer.id;
                        this.gameEngine.setGameMessage(otherPlayer, '&cspectating ' + killer.name, 0, 10);
                    }
                }

                // Set the dead player to spectate the killer
                player.playerSpectating = player.idLastDamagedBy;
                player.health = config.player.maxHealth;
                player.inventory = [];
                this.gameEngine.setGameMessage(player, '&cspectating ' + killer.name, 0, 10);
                this.gameEngine.setGameMessage(player, '&crespawn in 10 seconds', 1, 2);
                this.gameEngine.setGameMessage(killer, '&akilled ' + player.name, 0, 5);

                // Add the dead player to the spectate timeout list
                this.spectateTimeouts.set(player, Date.now() / 1000);
                this.gameEngine.playerUpdateSinceLastEmit = true;
            } else {
                // Respawn the player if no killer is found
                this.gameEngine.playerManager.respawnPlayer(player);
            }
        } else {
            // Respawn the player if no valid killer is found
            this.gameEngine.playerManager.respawnPlayer(player);
        }
    }




    onItemPickup(_player: Player): void {
    }


}
