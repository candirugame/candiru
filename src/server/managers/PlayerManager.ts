import { Player } from "../models/Player.ts";
import { Vector3 } from '../models/Vector3.ts';
import { Quaternion } from '../models/Quaternion.ts';
import { DataValidator } from '../DataValidator.ts';
import { MapData } from "../models/MapData.ts";
import config from "../config.ts";
import { WorldItem } from "../models/WorldItem.ts";
import { ItemManager } from "./ItemManager.ts";

export class PlayerManager {
    private players: Map<number, Player> = new Map();
    private mapData: MapData;
    private itemManager!: ItemManager;

    constructor(mapData: MapData) {
        this.mapData = mapData;
    }

    setItemManager(itemManager: ItemManager) {
        this.itemManager = itemManager
    }

    addOrUpdatePlayer(data: Player): { isNew: boolean; player?: Player } {
        const { error } = DataValidator.validatePlayerData(data);
        if (error) {
            //throw new Error(`Invalid player data: ${error.message}`);
            throw new Error(`⚠️ invalid player data `);
           // console.log('⚠️ invalid player data recieved')
        }

        const existingPlayer = this.players.get(data.id);
        if (data.name.length < 1) data.name = 'possum' + data.id.toString().substring(0,3);
        if(data.chatMsg.startsWith('/admin ')) data.chatMsg = '/admin ' + data.chatMsg.substring(7).replace(/./g, '*');
        if(data.chatMsg.startsWith('>')) data.chatMsg = '&2'+data.chatMsg;
        if(!data.chatMsg.startsWith('&f')) data.chatMsg = '&f'+data.chatMsg;
        if (existingPlayer) {
            // Handle forced acknowledgment
            if (existingPlayer.forced && !data.forcedAcknowledged) {
                return { isNew: false };
            }
            if (existingPlayer.forced && data.forcedAcknowledged) {
                existingPlayer.forced = false;
                //console.log(`🟢 ${data.name}(${data.id}) acknowledged force`);
            }

            // Update existing player, preserving certain fields
            data.health = existingPlayer.health;
            data.inventory = existingPlayer.inventory;
            data.lastDamageTime = existingPlayer.lastDamageTime;
            data.updateTimestamp = Date.now() / 1000;

            this.players.set(data.id, data);
            return { isNew: false };
        } else {
            // New playera
            data.inventory = [...config.player.baseInventory];
            const spawnPoint = this.getRandomSpawnPoint();
            data.position = spawnPoint.vec;
            data.health = config.player.maxHealth;
            data.lookQuaternion = [spawnPoint.quaternion.x, spawnPoint.quaternion.y, spawnPoint.quaternion.z, spawnPoint.quaternion.w];
            data.forced = true;
            this.players.set(data.id, data);
            this.itemManager.triggerUpdateFlag();

            return { isNew: true, player: data };
        }
    }

    removePlayer(playerId: number) {
        this.players.delete(playerId);
    }

    getAllPlayers(): Player[] {
        return Array.from(this.players.values());
    }

    getPlayerById(playerId: number): Player | undefined {
        return this.players.get(playerId);
    }

    respawnPlayer(player: Player) {
        const spawnPoint = this.getRandomSpawnPoint();
        for(let i = 0; i < player.inventory.length; i++){
            this.itemManager.pushItem(new WorldItem(player.position, player.inventory[i]));
        }
        player.inventory = [...config.player.baseInventory];
        player.position = spawnPoint.vec;
        player.lookQuaternion = [spawnPoint.quaternion.x, spawnPoint.quaternion.y, spawnPoint.quaternion.z, spawnPoint.quaternion.w];
        player.health = config.player.maxHealth;
        player.gravity = 0;
        player.velocity = new Vector3(0, 0, 0);
        player.forced = true;
        this.players.set(player.id, player);
    }

    regenerateHealth() {
        const currentTime = Date.now() / 1000;
        for (const player of this.players.values()) {
            const lastDamage = player.lastDamageTime ?? 0;
            if (player.health < config.player.maxHealth && (lastDamage + config.health.regenDelay < currentTime)) {
                player.health += config.health.regenRate / config.server.tickRate; // Adjusted per tick
                if (player.health > config.player.maxHealth) player.health = config.player.maxHealth;
            }
        }
    }

    private getRandomSpawnPoint(): { vec: Vector3; quaternion: Quaternion } {
        if (!this.mapData) {
            // Default spawn point if map data is unavailable
            return { vec: new Vector3(2, 1, 0), quaternion: new Quaternion(0, 0, 0, 1) };
        }

        const randomIndex = Math.floor(Math.random() * this.mapData.respawnPoints.length);
        const respawnPoint = this.mapData.respawnPoints[randomIndex];
        return { vec: respawnPoint.position, quaternion: respawnPoint.quaternion };
    }
}