import * as THREE from 'three';
import { FFAGamemode } from './FFAGamemode.ts';
import { Player } from '../../shared/Player.ts';
import config from '../config.ts';
import { WorldItem } from '../models/WorldItem.ts';

export class KingOfTheHillGamemode extends FFAGamemode {
	private readonly FLAG_ITEM_TYPE: number = 4;
	private gameActive: boolean = true;
	private resetTimestamp: number | null = null;
	private isAnnouncingWin: boolean = false; // Flag to indicate win announcement
	private winner: Player | null = null;
	private lastParticleTimestamp: number = 0;
	private hillCenter: THREE.Vector3 | null = null;
	private hillSize = 2; // Size of the hill area
	private capTimeSinceReset = 0;

	override init(): void {
		super.init();
		console.log('🚩 King of the Hill initialized');
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
		if (this.gameActive && this.hillCenter == null) {
			this.randomizeHill();
		}

		const players = this.gameEngine.playerManager.getAllPlayers();
		const playersOnHill = this.getPlayersOnHill(players);
		let winner: Player | null = null;
		let flagHolder: Player | null = null;
		let hillEmitMode: 'NONE' | 'ONE' | 'MULTI';

		if (playersOnHill) {
			hillEmitMode = 'NONE';
			if (playersOnHill.length == 1) {
				flagHolder = playersOnHill[0];
				hillEmitMode = 'ONE';
			}
			if (playersOnHill.length > 1) {
				hillEmitMode = 'MULTI';
			}
		} else {
			hillEmitMode = 'NONE';
		}

		if (flagHolder) {
			// Increment points for the flag holder
			const extras = this.gameEngine.playerManager.getPlayerExtrasById(flagHolder.id);
			if (extras && this.hillCenter) {
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

					//count up capture time
					this.capTimeSinceReset += 1;
					if (this.capTimeSinceReset >= config.game.pointsToEvent) {
						this.capTimeSinceReset = 0;

						this.randomizeHill();
						// this.gameEngine.emitParticleData({ //fireworks!!
						// 	position: this.hillCenter.clone().add(new THREE.Vector3(0, 0.5, 0)),
						// 	count: 128,
						// 	velocity: new THREE.Vector3(0, 0, 0),
						// 	spread: 6,
						// 	lifetime: 15,
						// 	size: 0.15,
						// 	color: new THREE.Color(0x00ff00), // Green color
						// });
					}
				}
			}
		}

		// Update direction indicators
		// if (flagHolder) {
		// 	// Flag is held by a player
		// 	for (const player of players) {
		// 		if (player.id === flagHolder.id) {
		// 			player.directionIndicatorVector = undefined;
		// 		} else {
		// 			player.directionIndicatorVector = flagHolder.position.clone();
		// 		}
		// 	}
		// } else {
		// 	// Flag is in the world
		// 	const flagItem = this.getFlagInWorld();
		// 	if (flagItem) {
		// 		for (const player of players) {
		// 			player.directionIndicatorVector = flagItem.vector.clone();
		// 		}
		// 	}
		// }

		for (const player of players) {
			if (player.playerSpectating !== -1) {
				player.directionIndicatorVector = undefined;
			}

			if (this.positionIsOnHill(player.position)) {
				player.directionIndicatorVector = undefined;
			} else {
				if (this.hillCenter) player.directionIndicatorVector = this.hillCenter.clone();
			}
		}

		if (currentTime - this.lastParticleTimestamp > 0.08 && this.hillCenter) {
			const timeSinceLastParticle = currentTime - this.lastParticleTimestamp;

			const particleCountPerFrame = 1;
			const particleVelocity = 0.3;
			const rotationSpeed = 3;
			const lifetime = 3;

			for (let i = 0; i < particleCountPerFrame; i++) {
				const particlePos = this.hillCenter.clone();

				let particleColor = 0xaaaaaa; //gray
				if (hillEmitMode === 'ONE') {
					particleColor = 0x00b300; // green
				} else if (hillEmitMode === 'MULTI') {
					particleColor = 0xb54e00; // orange
				}

				const iterFracTimeDiff = timeSinceLastParticle / particleCountPerFrame * i;
				const iterFracTime = currentTime - iterFracTimeDiff;

				particlePos.x += Math.cos(iterFracTime * rotationSpeed) * this.hillSize;
				particlePos.z += Math.sin(iterFracTime * rotationSpeed) * this.hillSize;
				particlePos.y += iterFracTimeDiff * particleVelocity;
				//			console.log(iterFracTime + ',' + particleVelocity + ',' + (iterFracTime * particleVelocity));

				//particlePos.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5));

				this.gameEngine.emitParticleData({
					position: particlePos,
					count: 1,
					velocity: new THREE.Vector3(0, particleVelocity, 0),
					spread: 0,
					lifetime: lifetime,
					size: 0.2,
					color: new THREE.Color(particleColor),
				});
			}

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
		const playersOnHill = this.getPlayersOnHill(players);
		if (playersOnHill && playersOnHill.length == 1) flagHolder = playersOnHill[0];

		// Determine leader and flag holder
		for (const player of players) {
			const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
			if (extras) {
				if (extras.points > maxPoints) {
					maxPoints = extras.points;
					leader = player;
				}
			}
		}

		for (const player of players) player.doPhysics = true;

		for (const player of players) {
			const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
			if (!extras) continue;

			const personalSeconds = config.game.pointsToWin - extras.points;

			const timeToMove = config.game.pointsToEvent - this.capTimeSinceReset;

			// Only update gameMsgs if player is not spectating
			if (player.playerSpectating === -1) {
				if (flagHolder && player.id == flagHolder.id) {
					player.gameMsgs = [
						'&ayou are capturing',
						`&c${timeToMove} seconds to move`,
					];
				} else if (flagHolder) {
					player.gameMsgs = [
						`&c${flagHolder.name} is capturing `,
						`&c${timeToMove} seconds to move`,
					];
				} else if (playersOnHill && playersOnHill.length > 1) {
					player.gameMsgs = [
						'&ccapture blocked >:)',
					];
				} else {
					player.gameMsgs = [
						'&6capture point free',
						`&6${timeToMove} seconds to move`,
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
	private randomizeHill(): void {
		const capturePoints = this.gameEngine.itemManager['mapData'].capturePoints;
		if (!capturePoints || capturePoints.length === 0) return;

		const randomIndex = Math.floor(Math.random() * capturePoints.length);
		let randomPoint = capturePoints[randomIndex];
		if (this.hillCenter && randomPoint.position.clone().sub(this.hillCenter).length() < 1) {
			randomPoint = capturePoints[(randomIndex + 1) % capturePoints.length];
		}

		if (randomPoint) {
			this.hillCenter = randomPoint.position.clone();
			this.hillSize = randomPoint.scale;
			console.log(`🚩 Hill set to (${randomPoint.position.x}, ${randomPoint.position.y}, ${randomPoint.position.z})`);
		} else {
			console.error('⚠️ No spawn points available to spawn the hill.');
		}
	}

	/**
	 * Finds the player currently holding the flag.
	 */
	private getPlayersOnHill(players: Player[]): Player[] | null {
		if (!this.hillCenter) return null;
		const outPlayers: Player[] = [];
		for (const player of players) {
			if (player.playerSpectating !== -1) continue; // Skip if player is spectating
			if (this.positionIsOnHill(player.position.clone())) {
				outPlayers.push(player);
			}
		}
		if (outPlayers.length > 0) return outPlayers;
		return null;
	}

	private positionIsOnHill(position: THREE.Vector3): boolean {
		if (!this.hillCenter) return false;
		const xyDist = Math.hypot(position.x - this.hillCenter.x, position.z - this.hillCenter.z);
		const yDist = Math.abs(position.y - this.hillCenter.y);
		return xyDist < this.hillSize && yDist < 1;
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
	 * Resets all players after a win: respawns them and clears their inventories.
	 */
	resetAfterWin(): void {
		for (const player of this.gameEngine.playerManager.getAllPlayers()) {
			// Respawn the player
			this.gameEngine.playerManager.respawnPlayer(player);

			// Clear the player's inventory
			player.inventory = [];

			// Remove spectate status
			player.playerSpectating = -1;

			//make player do physics again
			player.doPhysics = true;

			// Clear direction indicators
			player.directionIndicatorVector = undefined;

			// Clear game messages
			this.gameEngine.setGameMessage(player, '', 0);
			this.gameEngine.setGameMessage(player, '', 1);
		}

		// Reset the game state
		this.resetGame();
	}

	/**
	 * Resets the game by clearing points, removing the flag, and respawning it.
	 */
	resetGame(): void {
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
			this.gameEngine.playerManager.respawnPlayer(player);
		}

		// Remove flag from the world if it exists
		//const allItems = this.gameEngine.itemManager.getAllItems();
		//allItems.filter((item) => item.itemType !== this.FLAG_ITEM_TYPE);
		// Directly modifying private property 'worldItems' (not recommended)

		// Clear all world items
		this.gameEngine.itemManager.worldItems = [];
		this.gameEngine.itemManager.triggerUpdateFlag();

		// Spawn a new flag
		this.randomizeHill();

		//set sky color to black
		this.gameEngine.serverInfo.skyColor = '#000000';

		// Reset game state
		this.gameActive = true;
		this.resetTimestamp = null;

		console.log('✅ Solo CTF game has been reset.');
	}
}
