import { PlayerManager } from './PlayerManager.ts';
import { ChatManager } from './ChatManager.ts';
import { DamageRequest } from '../models/DamageRequest.ts';
import { DataValidator } from '../DataValidator.ts';
import { GameEngine } from '../GameEngine.ts';

export class DamageSystem {
	private gameEngine!: GameEngine;

	constructor(
		private playerManager: PlayerManager,
		private chatManager: ChatManager,
	) {}

	public setGameEngine(gameEngine: GameEngine) {
		this.gameEngine = gameEngine;
	}

	handleDamageRequest(unparsedData: DamageRequest) {
		const { data, error } = DataValidator.validateDamageRequest(unparsedData);
		if (error) {
			console.warn(`Invalid damage request: ${error.message}`);
			return;
		}

		const targetPlayer = this.playerManager.getPlayerById(data.targetPlayer.id);
		const localPlayer = this.playerManager.getPlayerById(data.localPlayer.id);

		if (!targetPlayer || !localPlayer) {
			console.warn('Target or local player not found.');
			return;
		}

		// Validate positions
		const localPlayerSentPosition = data.localPlayer.position;
		const localPlayerServerPosition = localPlayer.position;
		const localDistance = localPlayerSentPosition.distanceTo(localPlayerServerPosition);

		const targetPlayerSentPosition = data.targetPlayer.position;
		const targetPlayerServerPosition = targetPlayer.position;
		const targetDistance = targetPlayerSentPosition.distanceTo(targetPlayerServerPosition);

		const MAX_DESYNC_DISTANCE = 1; // Threshold for considering positions in sync

		if (localDistance > MAX_DESYNC_DISTANCE || targetDistance > MAX_DESYNC_DISTANCE) {
			//console.warn(`⚠️ Client out of sync - localDistance: ${localDistance}, targetDistance: ${targetDistance}`);
			// Optionally, send a message back to the client
			// this.chatManager.whisperChatMessage('⚠️ Shot not registered (client out of sync)', localPlayer.socket);
			return;
		}

		if (localPlayer.playerSpectating !== -1) {
			console.log('⚠️Player is spectating, cannot apply damage');
			return;
		}

		// Apply damage
		targetPlayer.health -= data.damage / targetPlayer.protection;
		targetPlayer.lastDamageTime = Date.now() / 1000;
		targetPlayer.idLastDamagedBy = localPlayer.id;

		if (targetPlayer.health <= 0) {
			const killerName = localPlayer.name;
			const killedName = targetPlayer.name;

			let killType = ' ^b^b ';
			if (localPlayer.inventory[localPlayer.heldItemIndex] === 1) killType = ' ^c^d '; //banana
			if (localPlayer.inventory[localPlayer.heldItemIndex] === 2) killType = ' ^e^f '; //fish
			if (localPlayer.inventory[localPlayer.heldItemIndex] === 3) killType = ' ^i^j '; //pipe
			if (localPlayer.inventory[localPlayer.heldItemIndex] === 5) {
				killType = data.wasHeadshot ? ' ^g^h ^b ' : ' ^g^h '; //sniper headshot:not
			}

			this.chatManager.broadcastEventMessage(`&c${killerName}${killType}${killedName}`);

			console.log(`💔 ${killerName} killed ${killedName}`);
			//this.playerManager.respawnPlayer(targetPlayer);
			this.gameEngine.periodicCleanup();
		}

		// Update player data
		this.playerManager.addOrUpdatePlayer(targetPlayer);
	}
}
