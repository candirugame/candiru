import { Player, PlayerData } from '../../shared/Player.ts';
import { DataValidator } from '../DataValidator.ts';
import { MapData } from '../models/MapData.ts';
import config from '../config.ts';
import { WorldItem } from '../models/WorldItem.ts';
import { ItemManager } from './ItemManager.ts';
import { PlayerExtras } from '../models/PlayerExtras.ts';
import * as THREE from 'three';
import { GameEngine } from '../GameEngine.ts';

interface PlayerWithExtras {
	player: Player;
	extras: PlayerExtras;
}

export class PlayerManager {
	private players: Map<number, PlayerWithExtras> = new Map();
	private mapData: MapData;
	private itemManager!: ItemManager;
	private gameEngine!: GameEngine;

	constructor(mapData: MapData) {
		this.mapData = mapData;
	}

	setItemManager(itemManager: ItemManager) {
		this.itemManager = itemManager;
	}

	setGameEngine(gameEngine: GameEngine) {
		this.gameEngine = gameEngine;
	}

	addOrUpdatePlayer(unparsedData: PlayerData): { isNew: false } | { isNew: true; player: Player } {
		const { data: player, error } = DataValidator.validatePlayerData(unparsedData);
		if (error) {
			throw new Error(`⚠️ invalid player data `);
		}

		const existingPlayerData = this.players.get(player.id);
		if (player.name.length < 1) player.name = 'possum' + player.id.toString().substring(0, 3);
		if (player.chatMsg.startsWith('/admin ')) {
			player.chatMsg = '/admin ' + player.chatMsg.substring(7).replace(/./g, '*');
		}
		if (player.chatMsg.startsWith('>')) player.chatMsg = '&2' + player.chatMsg;
		if (!player.chatMsg.startsWith('&f')) player.chatMsg = '&f' + player.chatMsg;

		if (existingPlayerData) {
			// Handle forced acknowledgment
			if (existingPlayerData.player.forced && !player.forcedAcknowledged) {
				return { isNew: false };
			}
			if (existingPlayerData.player.forced && player.forcedAcknowledged) {
				existingPlayerData.player.forced = false;
			}

			// Update existing player, preserving certain fields
			player.speed = existingPlayerData.player.speed;
			player.acceleration = existingPlayerData.player.acceleration;
			player.health = existingPlayerData.player.health;
			player.protection = existingPlayerData.player.protection;
			player.inventory = existingPlayerData.player.inventory;
			player.lastDamageTime = existingPlayerData.player.lastDamageTime;
			player.idLastDamagedBy = existingPlayerData.player.idLastDamagedBy;
			player.forced = existingPlayerData.player.forced;
			player.gameMsgs = existingPlayerData.player.gameMsgs;
			player.gameMsgs2 = existingPlayerData.player.gameMsgs2;
			player.playerSpectating = existingPlayerData.player.playerSpectating;
			player.doPhysics = existingPlayerData.player.doPhysics;
			player.thirdPerson = existingPlayerData.player.thirdPerson;
			player.updateTimestamp = Date.now() / 1000;

			const updatedData: PlayerWithExtras = {
				player: player,
				extras: existingPlayerData.extras,
			};
			this.players.set(player.id, updatedData);
			return { isNew: false };
		} else if (this.players.size < config.game.maxPlayers) {
			// New player

			player.inventory = [...config.player.baseInventory];
			const spawnPoint = this.getRandomSpawnPoint();
			player.position = spawnPoint.vec;
			player.health = config.player.maxHealth;
			player.gameMsgs = [];
			player.gameMsgs2 = [];
			player.playerSpectating = -1;
			player.lookQuaternion = new THREE.Quaternion(
				spawnPoint.quaternion.x,
				spawnPoint.quaternion.y,
				spawnPoint.quaternion.z,
				spawnPoint.quaternion.w,
			);
			player.gravity = 0;
			player.speed = 5;
			player.acceleration = 100;
			player.protection = 1;
			player.idLastDamagedBy = -1;
			player.playerSpectating = -1;
			player.lastDamageTime = 0;
			player.directionIndicatorVector = undefined;
			player.doPhysics = true;
			player.forced = true;

			player.updateTimestamp = Date.now() / 1000;

			const newPlayerData: PlayerWithExtras = {
				player: player,
				extras: new PlayerExtras(),
			};
			this.players.set(player.id, newPlayerData);
			this.itemManager.triggerUpdateFlag();

			return { isNew: true, player: player };
		}
		return { isNew: false };
	}

	removePlayer(playerId: number) {
		this.players.delete(playerId);
	}

	getAllPlayers(): Player[] {
		return Array.from(this.players.values().map(({ player }) => player));
	}

	getPlayerById(playerId: number): Player | undefined {
		const playerData = this.players.get(playerId);
		return playerData?.player;
	}

	getPlayerDataById(playerId: number): PlayerWithExtras | undefined {
		return this.players.get(playerId);
	}

	getPlayerExtrasById(playerId: number): PlayerExtras | undefined {
		const playerData = this.players.get(playerId);
		return playerData?.extras;
	}

	getAllPlayerData(): PlayerWithExtras[] {
		return Array.from(this.players.values());
	}

	public dropAllItems(player: Player) {
		for (let i = 0; i < player.inventory.length; i++) {
			const position = player.position.clone();
			position.x += (Math.random() - 0.5) * 0.5;
			//position.y += (Math.random() - 0.5) * 0.5;
			position.z += (Math.random() - 0.5) * 0.5;
			this.itemManager.pushItem(new WorldItem(position, player.inventory[i].itemId));
		}
		player.inventory = [];
	}

	doDeathParticles(player: Player) {
		this.gameEngine.emitParticleData({
			position: player.position.clone(),
			count: 128,
			velocity: new THREE.Vector3(0, 0, 0),
			spread: 6,
			lifetime: 15,
			size: 0.01,
			color: new THREE.Color(1, 0, 0),
		});
	}

	respawnPlayer(player: Player) {
		const playerData = this.players.get(player.id);
		if (!playerData) return;

		const spawnPoint = this.getRandomSpawnPoint();
		player.position = spawnPoint.vec;
		player.lookQuaternion = new THREE.Quaternion(
			spawnPoint.quaternion.x,
			spawnPoint.quaternion.y,
			spawnPoint.quaternion.z,
			spawnPoint.quaternion.w,
		);
		player.health = config.player.maxHealth;
		player.gravity = 0;
		player.velocity = new THREE.Vector3(0, 0, 0);
		player.forced = true;

		const updatedPlayerData: PlayerWithExtras = {
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

	updateItemDurabilities(currentTime: number) {
		if (!config.items.shotsTakeDurability && !config.items.rotTakesDurability) return;

		for (const playerData of this.players.values()) {
			const player = playerData.player;

			for (let i = player.inventory.length - 1; i >= 0; i--) {
				const item = player.inventory[i];

				if (item.durability <= 0 && item.overflow > 0) {
					item.creationTimestamp = currentTime;
					item.shotsFired = 0;
					item.overflow -= 1;
				}

				const itemAge = currentTime - item.creationTimestamp;
				if (config.items.rotTakesDurability && item.lifetime) {
					item.durability = 1 - (itemAge / item.lifetime) + (item.durabilityOffset ?? 0);
				}
				if (config.items.shotsTakeDurability && item.shotsAvailable) {
					item.durability -= item.shotsFired / item.shotsAvailable;
				}
				// item.durability += item.durabilityOffset ?? 0;
			}
		}
	}

	public throwItem(playerId: number, heldItemIndex: number) {
		const player = this.getPlayerById(playerId);
		if (!player) return;
		const item = player.inventory[heldItemIndex];
		if (!item.itemId) return;

		if (item.overflow > 0) item.overflow--;
		else player.inventory.splice(heldItemIndex, 1);
	}

	private getRandomSpawnPoint(): { vec: THREE.Vector3; quaternion: THREE.Quaternion } {
		if (!this.mapData) {
			return { vec: new THREE.Vector3(2, 1, 0), quaternion: new THREE.Quaternion(0, 0, 0, 1) };
		}

		const randomIndex = Math.floor(Math.random() * this.mapData.respawnPoints.length);
		const respawnPoint = this.mapData.respawnPoints[randomIndex];
		return { vec: respawnPoint.position, quaternion: respawnPoint.quaternion };
	}

	public handleShotGroupAdded(playerId: number, heldItemIndex: number) {
		if (!config.items.shotsTakeDurability) return;

		const playerData = this.players.get(playerId);
		if (!playerData) return;

		const player = playerData.player;
		const itemId = player.inventory[heldItemIndex]?.itemId;
		if (itemId) {
			player.inventory[heldItemIndex].shotsFired++;
			// Notify GameEngine that player data changed so a delta is emitted promptly
			if (this.gameEngine) {
				this.gameEngine.playerUpdateSinceLastEmit = true;
			}
		}
	}
}
