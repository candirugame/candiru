import * as THREE from 'three';
import { FFAGamemode } from './FFAGamemode.ts';
import { Player } from '../../shared/Player.ts';
import config from '../config.ts';
import { WorldItem } from '../models/WorldItem.ts';
import { ItemRespawnPoint } from '../models/ItemRespawnPoint.ts';

export class SoloCTFGamemode extends FFAGamemode {
	private readonly FLAG_ITEM_TYPE: number = 4;
	private gameActive: boolean = true;
	private resetTimestamp: number | null = null;
	private isAnnouncingWin: boolean = false; // Flag to indicate win announcement
	private winner: Player | null = null;
	private lastParticleTimestamp: number = 0;

	override init(): void {
		super.init();
		console.log('🚩 Solo CTF Gamemode initialized');
	}

	override tick(): void {
		super.tick();

		if (this.isAnnouncingWin) this.doWinAnnouncement();

		if (!this.gameActive) {
			// Game is resetting, check if it's time to reset
			if (this.resetTimestamp && Date.now() / 1000 >= this.resetTimestamp) {
				this.resetGame();
			}
			return;
		}

		const currentTime = Date.now() / 1000;

		// Only spawn flag if it doesn't exist AND we're not in reset state
		if (this.gameActive && !this.flagExists()) {
			console.log('No flag found, spawning new flag');
			this.spawnFlag();
		}

		const players = this.gameEngine.playerManager.getAllPlayers();
		const flagHolder = this.getFlagHolder(players);
		let winner: Player | null = null;

		if (flagHolder) {
			// Increment points for the flag holder
			const extras = this.gameEngine.playerManager.getPlayerExtrasById(flagHolder.id);
			if (extras) {
				if (currentTime - extras.lastPointIncrementTime >= 1) { // 1 second has passed
					extras.points += 1;
					extras.lastPointIncrementTime = currentTime;

					// Check for win condition
					if (extras.points >= config.game.pointsToWin) {
						winner = flagHolder;
						this.announceWin(winner);
						this.gameActive = false;
						this.resetTimestamp = currentTime + config.game.respawnDelay;
					}
				}
			}
		}

		// Update direction indicators
		if (flagHolder) {
			// Flag is held by a player
			for (const player of players) {
				if (player.id === flagHolder.id) {
					player.directionIndicatorVector = undefined;
				} else {
					player.directionIndicatorVector = flagHolder.position.clone();
				}
			}
		} else {
			// Flag is in the world
			const flagItem = this.getFlagInWorld();
			if (flagItem) {
				for (const player of players) {
					player.directionIndicatorVector = flagItem.vector.clone();
				}
			}
		}

		if (currentTime - this.lastParticleTimestamp > 0.15) {
			let particlePos = new THREE.Vector3(0, 0, 0);
			if (flagHolder) {
				particlePos = flagHolder.position.clone();
			} else {
				const flagItem = this.getFlagInWorld();
				if (flagItem) {
					particlePos = flagItem.vector.clone();
				}
			}
			particlePos.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5));

			// stink particle over player
			this.gameEngine.emitParticleData({
				position: particlePos,
				count: 1,
				velocity: new THREE.Vector3(0, 0.5, 0),
				spread: 0.3,
				lifetime: 15,
				size: 0.04,
				color: new THREE.Color(0x00aa00),
			});
			this.lastParticleTimestamp = currentTime;
		}

		// Set directionIndicatorVector to undefined for spectating players
		for (const player of players) {
			if (player.playerSpectating !== -1) {
				player.directionIndicatorVector = undefined;
			}
		}

		this.gameEngine.playerUpdateSinceLastEmit = true;
	}

	override onPeriodicCleanup(): void {
		super.onPeriodicCleanup();

		// Do not update gameMsgs during win announcement
		if (this.isAnnouncingWin) {
			return;
		}

		const players = this.gameEngine.playerManager.getAllPlayers();
		let leader: Player | null = null;
		let maxPoints = -1;
		let flagHolder: Player | null = null;

		// Determine leader and flag holder
		for (const player of players) {
			const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
			if (extras) {
				if (extras.points > maxPoints) {
					maxPoints = extras.points;
					leader = player;
				}
				if (player.inventory.some((item) => item.itemId === this.FLAG_ITEM_TYPE)) {
					flagHolder = player;
				}
			}
		}

		for (const player of players) player.doPhysics = true;

		for (const player of players) {
			const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
			if (!extras) continue;

			const personalSeconds = config.game.pointsToWin - extras.points;

			// Only update gameMsgs if player is not spectating
			if (player.playerSpectating === -1) {
				if (player.inventory.some((item) => item.itemId === this.FLAG_ITEM_TYPE)) {
					player.gameMsgs = [
						'&ayou have the flag',
						`&a${personalSeconds} seconds. &4DON'T DIE.`,
					];
				} else if (flagHolder) {
					const flagHolderExtras = this.gameEngine.playerManager.getPlayerExtrasById(flagHolder.id);
					const flagHolderSeconds = flagHolderExtras ? config.game.pointsToWin - flagHolderExtras.points : 0;
					player.gameMsgs = [
						`&c${flagHolder.name} has the flag `,
						`&c${flagHolderSeconds} seconds remain`,
					];
				} else {
					player.gameMsgs = [
						'&6the flag has been dropped',
					];
				}
			}

			// Always update gameMsgs2
			let colorPrefix = '&a';
			if (leader) {
				const leaderExtras = this.gameEngine.playerManager.getPlayerExtrasById(leader.id);
				if (leaderExtras) {
					if (leader.id === player.id) {
						player.gameMsgs2[2] = colorPrefix + 'you are leading';
					} else {
						colorPrefix = '&c';
						player.gameMsgs2[2] = colorPrefix +
							`&c${config.game.pointsToWin - leaderExtras.points} seconds for ${leader.name}`;
					}
				}
			} else {
				player.gameMsgs2[2] = '';
			}
			player.gameMsgs2[1] = colorPrefix + `${personalSeconds} seconds to win`;
		}
	}

	override onPlayerConnect(player: Player): void {
		super.onPlayerConnect(player);
		// Additional connection logic if needed
	}

	override onPlayerDisconnect(player: Player): void {
		super.onPlayerDisconnect(player);
		// Additional disconnection logic if needed
	}

	override onPlayerDeath(player: Player): void {
		super.onPlayerDeath(player);
		// Additional death logic if needed
	}

	override onPlayerKill(player: Player): void {
		super.onPlayerKill(player);
		// Additional kill logic if needed
	}

	override onItemPickup(player: Player): void {
		super.onItemPickup(player);

		// Check if the picked up item is the flag
		if (player.inventory.some((item) => item.itemId === this.FLAG_ITEM_TYPE)) {
			// Reset the player's flag-related data
			const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
			if (extras) {
				extras.points = 0;
				extras.lastPointIncrementTime = Date.now() / 1000;
			}
		}
	}

	/**
	 * Checks if the flag exists either in the world or in any player's inventory.
	 */
	private flagExists(): boolean {
		// Check in the world
		const flagInWorld = this.gameEngine.itemManager.getAllItems().some((item) => item.itemType === this.FLAG_ITEM_TYPE);

		if (flagInWorld) return true;

		// Check in players' inventories
		const players = this.gameEngine.playerManager.getAllPlayers();
		for (const player of players) {
			if (player.inventory.some((item) => item.itemId === this.FLAG_ITEM_TYPE)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Spawns the flag at a random spawn point.
	 */
	private spawnFlag(): void {
		const spawnPoint = this.getRandomSpawnPoint();
		if (spawnPoint) {
			const flag = new WorldItem(spawnPoint.position.clone(), this.FLAG_ITEM_TYPE);
			this.gameEngine.itemManager.pushItem(flag);
			console.log(`🚩 Flag spawned at (${spawnPoint.position.x}, ${spawnPoint.position.y}, ${spawnPoint.position.z})`);
		} else {
			console.error('⚠️ No spawn points available to spawn the flag.');
		}
	}

	/**
	 * Retrieves a random spawn point from the map data.
	 */
	private getRandomSpawnPoint(): ItemRespawnPoint | null {
		const itemSpawnPoints = this.gameEngine.itemManager['mapData'].itemRespawnPoints;
		if (!itemSpawnPoints || itemSpawnPoints.length === 0) return null;

		const randomIndex = Math.floor(Math.random() * itemSpawnPoints.length);
		return itemSpawnPoints[randomIndex];
	}

	/**
	 * Finds the player currently holding the flag.
	 */
	private getFlagHolder(players: Player[]): Player | null {
		for (const player of players) {
			if (player.inventory.some((item) => item.itemId === this.FLAG_ITEM_TYPE)) {
				return player;
			}
		}
		return null;
	}

	/**
	 * Finds the flag item in the world.
	 */
	private getFlagInWorld(): WorldItem | null {
		const flagItems = this.gameEngine.itemManager.getAllItems().filter((item) => item.itemType === this.FLAG_ITEM_TYPE);
		if (flagItems.length > 0) {
			return flagItems[0];
		}
		return null;
	}

	/**
	 * Announces the winner to all players, sets spectators, and updates their game messages.
	 */
	private announceWin(winner: Player): void {
		this.isAnnouncingWin = true; // Set the flag to indicate win announcement
		this.winner = winner;
		this.gameEngine.serverInfo.skyColor = '#FFFFFF';
		// Schedule to unset the win announcement flag after the respawn delay and reset the game
		winner.doPhysics = false;
		winner.gravity = 2.5;
		winner.forced = true;
		setTimeout(() => {
			this.resetAfterWin();
			this.isAnnouncingWin = false;
			this.winner = null;
		}, config.game.respawnDelay * 1000);
		console.log(`🏆 ${winner.name} has won the Solo CTF game!`);
	}

	private doWinAnnouncement() {
		const winner = this.winner;
		if (!winner) return;
		for (const player of this.gameEngine.playerManager.getAllPlayers()) {
			if (player.id !== winner.id) {
				// Set player to spectate the winner
				player.playerSpectating = winner.id;

				// Clear the player's inventory
				player.inventory = [];

				// Optionally, you can also reset other player states if needed
			}

			if (player.id === winner.id) {
				this.gameEngine.setGameMessage(player, `&ayou have won!`, 0, config.game.respawnDelay);
				this.gameEngine.setGameMessage(player, ``, 1, config.game.respawnDelay);
			} else {
				this.gameEngine.setGameMessage(
					player,
					`&c${winner.name} has transcended.`,
					0,
					config.game.respawnDelay,
				);
				this.gameEngine.setGameMessage(player, ``, 1, config.game.respawnDelay);
			}
		}
	}

	/**
	 * Resets the game by clearing points, removing the flag, and respawning it.
	 */
	public override resetGame(): void {
		console.log('🔄 Resetting Solo CTF game...');
		for (const player of this.gameEngine.playerManager.getAllPlayers()) {
			const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
			if (extras) {
				extras.points = 0;
				extras.lastPointIncrementTime = 0;
				extras.kills = 0;
				extras.deaths = 0;
				extras.killStreak = 0;
			}

			// Remove flag from player's inventory if they have it
			const flagIndex = player.inventory.findIndex((item) => item.itemId === this.FLAG_ITEM_TYPE);
			if (flagIndex !== -1) {
				player.inventory.splice(flagIndex, 1);
			}

			// Clear direction indicators
			player.directionIndicatorVector = undefined;

			// Reset spectate status
			player.playerSpectating = -1;

			// Clear game messages
			this.gameEngine.setGameMessage(player, '', 0);
			this.gameEngine.setGameMessage(player, '', 1);

			// Optionally, respawn the player to ensure they are back in the game
			//	this.gameEngine.playerManager.respawnPlayer(player);
		}

		// Remove flag from the world if it exists
		//const allItems = this.gameEngine.itemManager.getAllItems();
		//allItems.filter((item) => item.itemType !== this.FLAG_ITEM_TYPE);
		// Directly modifying private property 'worldItems' (not recommended)

		// Clear all world items
		this.gameEngine.itemManager.worldItems = [];
		this.gameEngine.itemManager.triggerUpdateFlag();

		// Spawn a new flag
		this.spawnFlag();

		//set sky color to black
		this.gameEngine.serverInfo.skyColor = '#000000';

		// Reset game state
		this.gameActive = true;
		this.resetTimestamp = null;

		console.log('✅ Solo CTF game has been reset.');
	}
}
