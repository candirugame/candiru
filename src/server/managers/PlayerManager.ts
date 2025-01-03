import { Player } from '../models/Player.ts';
import { Vector3 } from '../models/Vector3.ts';
import { Quaternion } from '../models/Quaternion.ts';
import { DataValidator } from '../DataValidator.ts';
import { MapData } from '../models/MapData.ts';
import config from '../config.ts';
import { WorldItem } from '../models/WorldItem.ts';
import { ItemManager } from './ItemManager.ts';
import { PlayerExtras } from '../models/PlayerExtras.ts';

interface PlayerData {
	player: Player;
	extras: PlayerExtras;
}

export class PlayerManager {
	private players: Map<number, PlayerData> = new Map();
	private mapData: MapData;
	private itemManager!: ItemManager;

	constructor(mapData: MapData) {
		this.mapData = mapData;
	}

	setItemManager(itemManager: ItemManager) {
		this.itemManager = itemManager;
	}

	addOrUpdatePlayer(data: Player): { isNew: boolean; player?: Player } {
		const { error } = DataValidator.validatePlayerData(data);
		if (error) {
			throw new Error(`⚠️ invalid player data `);
		}

		const existingPlayerData = this.players.get(data.id);
		if (data.name.length < 1) data.name = 'possum' + data.id.toString().substring(0, 3);
		if (data.chatMsg.startsWith('/admin ')) data.chatMsg = '/admin ' + data.chatMsg.substring(7).replace(/./g, '*');
		if (data.chatMsg.startsWith('>')) data.chatMsg = '&2' + data.chatMsg;
		if (!data.chatMsg.startsWith('&f')) data.chatMsg = '&f' + data.chatMsg;

		if (existingPlayerData) {
			// Handle forced acknowledgment
			if (existingPlayerData.player.forced && !data.forcedAcknowledged) {
				return { isNew: false };
			}
			if (existingPlayerData.player.forced && data.forcedAcknowledged) {
				existingPlayerData.player.forced = false;
			}

			// Update existing player, preserving certain fields
			data.health = existingPlayerData.player.health;
			data.inventory = existingPlayerData.player.inventory;
			data.lastDamageTime = existingPlayerData.player.lastDamageTime;
			data.gameMsgs = existingPlayerData.player.gameMsgs;
			data.gameMsgs2 = existingPlayerData.player.gameMsgs2;
			data.playerSpectating = existingPlayerData.player.playerSpectating;
			data.updateTimestamp = Date.now() / 1000;

			const updatedData: PlayerData = {
				player: data,
				extras: existingPlayerData.extras,
			};
			this.players.set(data.id, updatedData);
			return { isNew: false };
		} else {
			// New player
			data.inventory = [...config.player.baseInventory];
			const spawnPoint = this.getRandomSpawnPoint();
			data.position = spawnPoint.vec;
			data.health = config.player.maxHealth;
			data.gameMsgs = [];
			data.gameMsgs2 = [];
			data.playerSpectating = -1;
			data.lookQuaternion = [
				spawnPoint.quaternion.x,
				spawnPoint.quaternion.y,
				spawnPoint.quaternion.z,
				spawnPoint.quaternion.w,
			];
			data.forced = true;

			const newPlayerData: PlayerData = {
				player: data,
				extras: new PlayerExtras(),
			};
			this.players.set(data.id, newPlayerData);
			this.itemManager.triggerUpdateFlag();

			return { isNew: true, player: data };
		}
	}

	removePlayer(playerId: number) {
		this.players.delete(playerId);
	}

	getAllPlayers(): Player[] {
		return Array.from(this.players.values()).map((playerData) => playerData.player);
	}

	getPlayerById(playerId: number): Player | undefined {
		const playerData = this.players.get(playerId);
		return playerData?.player;
	}

	getPlayerDataById(playerId: number): PlayerData | undefined {
		return this.players.get(playerId);
	}

	getPlayerExtrasById(playerId: number): PlayerExtras | undefined {
		const playerData = this.players.get(playerId);
		return playerData?.extras;
	}

	getAllPlayerData(): PlayerData[] {
		return Array.from(this.players.values());
	}

	public dropAllItems(player: Player) {
		for (let i = 0; i < player.inventory.length; i++) {
			this.itemManager.pushItem(new WorldItem(player.position, player.inventory[i]));
		}
		player.inventory = [];
	}

	respawnPlayer(player: Player) {
		const playerData = this.players.get(player.id);
		if (!playerData) return;

		const spawnPoint = this.getRandomSpawnPoint();
		player.position = spawnPoint.vec;
		player.lookQuaternion = [
			spawnPoint.quaternion.x,
			spawnPoint.quaternion.y,
			spawnPoint.quaternion.z,
			spawnPoint.quaternion.w,
		];
		player.health = config.player.maxHealth;
		player.gravity = 0;
		player.velocity = new Vector3(0, 0, 0);
		player.forced = true;

		const updatedPlayerData: PlayerData = {
			player: player,
			extras: playerData.extras,
		};
		this.players.set(player.id, updatedPlayerData);
	}

	regenerateHealth() {
		const currentTime = Date.now() / 1000;
		for (const playerData of this.players.values()) {
			const player = playerData.player;
			const lastDamage = player.lastDamageTime ?? 0;
			if (player.health < config.player.maxHealth && (lastDamage + config.health.regenDelay < currentTime)) {
				player.health += config.health.regenRate / config.server.tickRate;
				if (player.health > config.player.maxHealth) player.health = config.player.maxHealth;
			}
		}
	}

	private getRandomSpawnPoint(): { vec: Vector3; quaternion: Quaternion } {
		if (!this.mapData) {
			return { vec: new Vector3(2, 1, 0), quaternion: new Quaternion(0, 0, 0, 1) };
		}

		const randomIndex = Math.floor(Math.random() * this.mapData.respawnPoints.length);
		const respawnPoint = this.mapData.respawnPoints[randomIndex];
		return { vec: respawnPoint.position, quaternion: respawnPoint.quaternion };
	}
}
