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
			const extras = this.gameEngine.playerManager.getPlayerExtrasById(player.id);
			if (extras) player.gameMsgs2 = ['&7' + extras.kills + ' kills, ' + extras.deaths + ' deaths'];
		}
	}

	onPlayerConnect(_player: Player): void {
	}

	onPlayerDisconnect(_player: Player): void {
	}

	onPlayerDeath(player: Player): void {
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
				this.gameEngine.chatManager.broadcastChat(
					colorCode + player.name + ' is on a ' + extras.killStreak + ' kill streak',
				);
			}
		}
	}

	onItemPickup(_player: Player): void {
	}
}
