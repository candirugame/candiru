import { ChatManager } from "./managers/ChatManager.ts";
import { DamageSystem } from "./managers/DamageSystem.ts";
import { ItemManager } from "./managers/ItemManager.ts";
import { PlayerManager } from "./managers/PlayerManager.ts";
import { Server } from "https://deno.land/x/socket_io@0.2.0/mod.ts";
import config from "./config.ts";
import { Vector3 } from "./models/Vector3.ts";
import { ServerInfo } from "./models/ServerInfo.ts";
import {DataValidator} from "./DataValidator.ts";

export class GameEngine {
    private lastPlayerTickTimestamp: number = Date.now() / 1000;
    private lastItemUpdateTimestamp: number = Date.now() / 1000;
    private playerUpdateSinceLastEmit: boolean = false;
    private itemUpdateSinceLastEmit: boolean = false;
    private serverInfo: ServerInfo = new ServerInfo();

    constructor(
        private playerManager: PlayerManager,
        private itemManager: ItemManager,
        private chatManager: ChatManager,
        private damageSystem: DamageSystem,
        private io: Server
    ) {}

    start() {
        setInterval(() => this.serverTick(), 1000 / config.server.tickRate);
        setInterval(() => this.periodicCleanup(), config.server.cleanupInterval);
        setInterval(() => this.emitServerInfo(), config.server.cleanupInterval);
    }

    private serverTick() {
        try {
            const currentTime = Date.now() / 1000;
            this.playerManager.regenerateHealth();
            this.itemManager.tick(currentTime);

            // Emit player data if there are updates or enough time has passed
            if (this.playerUpdateSinceLastEmit || currentTime - this.lastPlayerTickTimestamp > 1 / config.server.tickRate) {
                try {
                    this.io.emit('remotePlayerData', this.playerManager.getAllPlayers());
                    this.playerUpdateSinceLastEmit = false;
                    this.lastPlayerTickTimestamp = currentTime;
                } catch (err) {
                    console.error('Error emitting player data:', err);
                }
            }

            // Emit item data if there are updates
            if (this.itemUpdateSinceLastEmit || this.itemManager.hasUpdates()) {
                try {
                    this.io.emit('worldItemData', this.itemManager.getAllItems());
                    this.itemUpdateSinceLastEmit = false;
                } catch (err) {
                    console.error('Error emitting item data:', err);
                }
            }
        } catch (error) {
            console.error('Error in serverTick:', error);
        }
    }

    private periodicCleanup() {
        try {
            const currentTime = Date.now() / 1000;
            const players = this.playerManager.getAllPlayers();

            players.forEach(player => {
                if (player.position.y < -150) {
                    player.health = 0;
                    player.velocity = new Vector3(0, 0, 0);
                    this.chatManager.broadcastChat(`${player.name} fell off :'(`);
                    console.log(`💔 ${player.name}(${player.id}) fell off the map`);
                }

                if (player.health <= 0) {
                    this.playerManager.respawnPlayer(player);
                }

                if ((player.updateTimestamp || 0) + config.player.disconnectTime < currentTime) {
                    console.log(`🟠 ${player.name}(${player.id}) left`);
                    this.chatManager.broadcastChat(`${player.name} left`);
                    this.playerManager.removePlayer(player.id);
                }
            });

            const items = this.itemManager.getAllItems();
            items.forEach(item => {
                if (item.vector.y < -5) {
                    this.itemManager.removeItem(item.id);
                    this.itemUpdateSinceLastEmit = true;
                }
            });
        } catch (error) {
            console.error('Error in periodicCleanup:', error);
        }
    }

    // Method to emit server info to all clients
    public emitServerInfo() {
        this.serverInfo.version = DataValidator.getServerVersion();
        this.serverInfo.currentPlayers = this.playerManager.getAllPlayers().length;
        this.io.emit('serverInfo', this.serverInfo);
    }
}
