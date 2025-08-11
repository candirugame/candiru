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
			// despawn old items
			if (config.items.despawnTime != 0) {
				this.worldItems = this.worldItems.filter((item) => {
					const itemAge = currentTime - item.creationTimestamp;
					if (itemAge > config.items.despawnTime) {
						this.itemUpdateFlag = true;
						//	console.log(`🗑️ Item ${item.id} despawned after ${itemAge} seconds.`);
						return false; // Remove the item
					}
					return true; // Keep the item
				});
			}
		} catch (error) {
			console.log('⚠ Error in ItemManager tick:', error);
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
				// helper to see if player has itemId
				const hasItem = (id: number) => player.inventory.some((inv) => inv.itemId === id);
				const addItem = (id: number, durability: number = 100) => {
					player.inventory.push({ itemId: id, durability });
					shouldPickup = true;
				};
				switch (item.itemType) {
					case 0: // Cube
						addItem(0, 1); // maybe cosmetic / stackless
						this.chatManager.broadcastChat(`${player.name} picked up [Object]!`);
						console.log(`📦 ${player.name} picked up cube!`);
						break;
					case 1: // Banana
						if (!hasItem(1)) {
							addItem(1);
							console.log(`🍌 ${player.name} picked up banana!`);
						}
						break;
					case 2: // Fish
						if (!hasItem(2)) {
							addItem(2);
							console.log(`🐟 ${player.name} picked up fish!`);
						}
						break;
					case 3: // Pipe
						if (!hasItem(3)) {
							addItem(3);
							console.log(`⚔️ ${player.name} picked up pipe!`);
						}
						break;
					case 4: // Flag
						if (!hasItem(4)) {
							addItem(4);
							console.log(`🚩 ${player.name} picked up the flag!`);
						}
						break;
					case 5: // bottle / sniper
						if (!hasItem(5)) {
							addItem(5);
							console.log(`🍌 ${player.name} picked up sniper!`); // (emoji reused)
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
