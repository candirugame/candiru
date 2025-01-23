import { WorldItem } from '../models/WorldItem.ts';
import config from '../config.ts';
import { PlayerManager } from './PlayerManager.ts';
import { ChatManager } from './ChatManager.ts';
import * as THREE from 'three';
import { Gamemode } from '../gamemodes/Gamemode.ts';
import { MapData } from '../models/MapData.ts';
import { SoloCTFGamemode } from '../gamemodes/SoloCTFGamemode.ts';

export class ItemManager {
	worldItems: WorldItem[] = [];
	private lastItemCreationTimestamp: number = Date.now() / 1000;
	private itemUpdateFlag: boolean = false;
	private gamemode: Gamemode | false = false;

	constructor(private mapData: MapData, public playerManager: PlayerManager, private chatManager: ChatManager) {}

	public setGamemode(gamemode: Gamemode | false) {
		this.gamemode = gamemode;
	}

	tick(currentTime: number) {
		try {
			this.checkForPickups();
			// Only create random items if we're not in CTF mode
			if (!this.gamemode || !(this.gamemode instanceof SoloCTFGamemode)) {
				if (currentTime - this.lastItemCreationTimestamp > config.items.respawnTime) {
					this.createItem();
					this.lastItemCreationTimestamp = currentTime;
				}
			}
		} catch (error) {
			console.error('⚠ Error in ItemManager tick:', error);
		}
	}

	createItem() {
		if (!this.mapData) return;

		const randomIndex = Math.floor(Math.random() * this.mapData.itemRespawnPoints.length);
		const respawnPoint = this.mapData.itemRespawnPoints[randomIndex];
		const newItem = new WorldItem(
			new THREE.Vector3(respawnPoint.position.x, respawnPoint.position.y, respawnPoint.position.z),
			respawnPoint.itemId,
		);

		if (this.isItemCloseToPoint(newItem.vector, 1)) return; // Another item is too close
		if (this.worldItems.length >= config.items.maxItemsInWorld) return; // Max items reached

		this.worldItems.push(newItem);
		this.itemUpdateFlag = true;
	}

	pushItem(item: WorldItem) {
		this.worldItems.push(item);
		this.itemUpdateFlag = true;
	}

	checkForPickups() {
		const players = this.playerManager.getAllPlayers();
		for (const player of players) {
			if (player.playerSpectating !== -1) continue;
			if (player.health <= 0) continue;

			// Find all items within pickup range, not just the first one
			const nearbyItems = this.worldItems.filter(
				(item) => player.position.distanceTo(item.vector) < 0.5,
			);

			// Process each nearby item
			for (const item of nearbyItems) {
				let shouldPickup = false;
				switch (item.itemType) {
					case 0: // Cube
						player.inventory.push(0);
						shouldPickup = true;
						this.chatManager.broadcastChat(`${player.name} picked up [Object]!`);
						console.log(`📦 ${player.name} picked up cube!`);
						break;
					case 1: // Banana
						if (!player.inventory.includes(1)) {
							player.inventory.push(1);
							shouldPickup = true;
							console.log(`🍌 ${player.name} picked up banana!`);
						}
						break;
					case 2: // Fish
						if (!player.inventory.includes(2)) {
							player.inventory.push(2);
							shouldPickup = true;
							console.log(`🐟 ${player.name} picked up fish!`);
						}
						break;
					case 3: // Bat
						if (!player.inventory.includes(3)) {
							player.inventory.push(3);
							shouldPickup = true;
							console.log(`🦇 ${player.name} picked up bat!`);
						}
						break;
					case 4: // Flag
						if (!player.inventory.includes(4)) {
							player.inventory.push(4);
							shouldPickup = true;
							console.log(`🚩 ${player.name} picked up the flag!`);
						}
						break;
				}

				if (shouldPickup) {
					if (this.gamemode) this.gamemode.onItemPickup(player);
					const itemIndex = this.worldItems.indexOf(item);
					this.worldItems.splice(itemIndex, 1);
					this.itemUpdateFlag = true;
				}
			}
		}
	}

	isItemCloseToPoint(vector: THREE.Vector3, distance: number): boolean {
		return this.worldItems.some((item) => item.vector.distanceTo(vector) < distance);
	}

	getAllItems(): WorldItem[] {
		return this.worldItems;
	}

	removeItem(itemId: number) {
		this.worldItems = this.worldItems.filter((item) => item.id !== itemId);
		this.itemUpdateFlag = true;
	}

	hasUpdates(): boolean {
		if (this.itemUpdateFlag) {
			this.itemUpdateFlag = false;
			return true;
		}
		return false;
	}

	triggerUpdateFlag() {
		this.itemUpdateFlag = true;
	}
}
