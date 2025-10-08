import { GameEngine } from '../GameEngine.ts';
import { Gamemode } from './Gamemode.ts';
import config from '../config.ts';
import { Player } from '../../shared/Player.ts';

export class FFAGamemode extends Gamemode {
	private spectateTimeouts: Map<Player, number> = new Map();
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
			if (currentTime - timestamp > config.game.respawnDelay) {
				this.gameEngine.playerManager.respawnPlayer(player);
				player.playerSpectating = -1;
				this.spectateTimeouts.delete(player);
				this.gameEngine.setGameMessage(player, '', 0);
				this.gameEngine.setGameMessage(player, '', 1);
			} else {
				this.gameEngine.setGameMessage(
					player,
					'&crespawn in ' + Math.floor(config.game.respawnDelay + timestamp - currentTime) + ' seconds',
					1,
					0.5,
				);
			}
			player.health = config.player.maxHealth;
		}
	}

	onPeriodicCleanup(): void {
		// send kill death stats to all players
		for (const player of this.gameEngine.playerManager.getAllPlayers()) {
			const spectatorCount = this.gameEngine.playerManager.getAllPlayers().filter((p) =>
				p.playerSpectating === player.id
			).length;
			const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
			if (extras) {
				let colorPrefix = '&6';
				if (extras.kills > extras.deaths) colorPrefix = '&a';
				if (extras.kills < extras.deaths) colorPrefix = '&c';
				let kdMsg = colorPrefix + extras.kills + ' kills, ' + extras.deaths + ' deaths';
				if (spectatorCount > 0) kdMsg += ', &d' + spectatorCount + ' spectators';
				player.gameMsgs2 = [kdMsg];
			}
		}
	}

	onPlayerConnect(_player: Player): void {
	}

	onPlayerDisconnect(_player: Player): void {
	}

	onPlayerDeath(player: Player, noDeathParticles?: boolean): void {
		const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
		if (extras) {
			extras.deaths++;
			extras.killStreak = 0;
		}

		if (
			player.lastDamageTime && player.idLastDamagedBy &&
			Date.now() / 1000 - player.lastDamageTime < 5
		) {
			const killer = this.gameEngine.playerManager.getPlayerById(player.idLastDamagedBy);
			if (killer) {
				if (!noDeathParticles) this.gameEngine.playerManager.doDeathParticles(player);

				// Redirect spectators of the dead player to the killer
				for (const otherPlayer of this.gameEngine.playerManager.getAllPlayers()) {
					if (otherPlayer.playerSpectating === player.id) {
						otherPlayer.playerSpectating = killer.id;
						this.gameEngine.setGameMessage(otherPlayer, '&cspectating ' + killer.name, 0, config.game.respawnDelay);
					}
				}

				// Set the dead player to spectate the killer
				player.playerSpectating = player.idLastDamagedBy;
				player.health = config.player.maxHealth;
				this.gameEngine.playerManager.dropAllItems(player);

				this.gameEngine.setGameMessage(player, '&cspectating ' + killer.name, 0, config.game.respawnDelay);
				this.gameEngine.setGameMessage(player, `&crespawn in ${config.game.respawnDelay} seconds`, 1, 2);
				this.gameEngine.setGameMessage(killer, '&akilled ' + player.name, 0, 5);

				// Add the dead player to the spectate timeout list
				this.spectateTimeouts.set(player, Date.now() / 1000);
				this.gameEngine.playerUpdateSinceLastEmit = true;

				this.onPlayerKill(killer);
			} else {
				// Respawn the player if no killer is found
				this.gameEngine.playerManager.respawnPlayer(player);
			}
		} else {
			// Respawn the player if no valid killer is found
			this.gameEngine.playerManager.respawnPlayer(player);
		}
	}

	onPlayerKill(player: Player) {
		const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
		if (extras) {
			extras.kills++;
			extras.killStreak++;

			let colorCode = '&a';
			if (extras.killStreak >= 5) colorCode = '&b';
			if (extras.killStreak >= 10) colorCode = '&6';
			if (extras.killStreak >= 15) colorCode = '&g';

			if (extras.killStreak >= 3) {
				this.gameEngine.setGameMessage(player, colorCode + extras.killStreak + ' kill streak', 1, 5);
			}
			if (extras.killStreak >= 5) {
				this.gameEngine.chatManager.broadcastEventMessage(
					colorCode + player.name + ' is on a ' + extras.killStreak + ' kill streak',
				);
			}
		}
	}

	onItemPickup(_player: Player): void {
	}

	resetGame(): void {
	}

	/**
	 * Resets all players after a win: respawns them and clears their inventories.
	 */
	protected resetAfterWin(): void {
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

			this.gameEngine.playerManager.respawnPlayer(player);
		}

		// Reset the game state
		this.resetGame();
	}
}
