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
            }
            player.health = config.player.maxHealth;
        }
    }

    onPeriodicCleanup(): void {

    }

    onPlayerConnect(player: Player): void {
    }

    onPlayerDisconnect(player: Player): void {
    }

    onPlayerDeath(player: Player): void {

        if(player.lastDamageTime && player.idLastDamagedBy &&
            Date.now()/1000 - player.lastDamageTime < 5 ){
            const killer = this.gameEngine.playerManager.getPlayerById(player.idLastDamagedBy);
            if(killer){
                player.playerSpectating = player.idLastDamagedBy;
                player.health = config.player.maxHealth;
                // player.gameMsgs[0] = '&cspectating ' + killer.name;
                // player.gameMsgs[1] = '&crespawn in 10 seconds';
                // killer.gameMsgs[0] = '&akilled ' + player.name;

                this.gameEngine.setGameMessage(player, '&cspectating ' + killer.name, 0, 8);
                this.gameEngine.setGameMessage(player, '&crespawn in 10 seconds', 1, 8);
                this.gameEngine.setGameMessage(killer, '&akilled ' + player.name, 0, 5);
                this.spectateTimeouts.set(player, Date.now()/1000);
                this.gameEngine.playerUpdateSinceLastEmit = true;


            }else{
                this.gameEngine.playerManager.respawnPlayer(player);
            }
        }else{
            this.gameEngine.playerManager.respawnPlayer(player);
        }
    }

    onItemPickup(player: Player): void {
    }


}
