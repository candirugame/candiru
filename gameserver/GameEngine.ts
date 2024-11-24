import { ChatManager } from "./managers/ChatManager.ts";
import { DamageSystem } from "./managers/DamageSystem.ts";
import { ItemManager } from "./managers/ItemManager.ts";
import { PlayerManager } from "./managers/PlayerManager.ts";
import { Server } from "https://deno.land/x/socket_io@0.2.0/mod.ts";
import config from "./config.ts";
import { Vector3 } from "./models/Vector3.ts";


export class GameEngine {
    private lastPlayerTickTimestamp: number = Date.now() / 1000;
    private lastItemUpdateTimestamp: number = Date.now() / 1000;
    private playerUpdateSinceLastEmit: boolean = false;
    private itemUpdateSinceLastEmit: boolean = false;

    constructor(
        private playerManager: PlayerManager,
        private itemManager: ItemManager,
        private chatManager: ChatManager,
        private damageSystem: DamageSystem,
        private io: Server
    ) {}

    start() {
        setInterval(() => this.serverTick(), 1000 / config.server.tickRate);
        setInterval(() => this.periodicCleanup(), 500);
    }

    private serverTick() {
        const currentTime = Date.now() / 1000;
        this.playerManager.regenerateHealth();
        this.itemManager.tick(currentTime);

        // Emit player data
        if (this.playerUpdateSinceLastEmit || currentTime - this.lastPlayerTickTimestamp > 1 / config.server.tickRate) {
            this.io.emit('remotePlayerData', this.playerManager.getAllPlayers());
            this.playerUpdateSinceLastEmit = false;
            this.lastPlayerTickTimestamp = currentTime;
        }

        // Emit item data
        if (this.itemUpdateSinceLastEmit || this.itemManager.hasUpdates()) {
            this.io.emit('worldItemData', this.itemManager.getAllItems());
            this.itemUpdateSinceLastEmit = false;
        }
    }

    private periodicCleanup() {
        const currentTime = Date.now() / 1000;
        const players = this.playerManager.getAllPlayers();

        players.forEach(player => {
            // Handle players falling below y = -150
            if (player.position.y < -150) {
                player.health = 0;
                player.velocity = new Vector3(0, 0, 0);
                this.chatManager.broadcastChat(`${player.name} fell off :'(`);
                console.log(`💔 ${player.name}(${player.id}) fell off the map`);
            }

            // Respawn players with health <= 0
            if (player.health <= 0) {
                this.playerManager.respawnPlayer(player);
            }

            // Kick players who haven't updated recently
            if ((player.updateTimestamp || 0) + config.player.disconnectTime < currentTime) {
                console.log(`🟠 ${player.name}(${player.id}) left`);
                this.chatManager.broadcastChat(`${player.name} left`);
                this.playerManager.removePlayer(player.id);
            }
        });

        // Remove items below y = -5
        const items = this.itemManager.getAllItems();
        items.forEach(item => {
            if (item.vector.y < -5) {
                this.itemManager.removeItem(item.id);
                this.itemUpdateSinceLastEmit = true;
            }
        });
    }
}