// DamageSystem.ts
import { PlayerManager } from "./PlayerManager.ts";
import { ChatManager } from "./ChatManager.ts";
import { DamageRequest } from "../models/DamageRequest.ts";
import { DataValidator } from "../DataValidator.ts";
import config from "../config.ts";
import { Vector3 } from "../models/Vector3.ts";

export class DamageSystem {
    constructor(
        private playerManager: PlayerManager,
        private chatManager: ChatManager
    ) {}

    handleDamageRequest(data: DamageRequest) {
        const validationResult = DataValidator.validateDamageRequest(data);
        if (!validationResult.success) {
            console.warn(`Invalid damage request: ${validationResult.error?.message}`);
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
        const localDistance = Vector3.distanceTo(localPlayerSentPosition, localPlayerServerPosition);

        const targetPlayerSentPosition = data.targetPlayer.position;
        const targetPlayerServerPosition = targetPlayer.position;
        const targetDistance = Vector3.distanceTo(targetPlayerSentPosition, targetPlayerServerPosition);

        const MAX_DESYNC_DISTANCE = 1; // Threshold for considering positions in sync

        if (localDistance > MAX_DESYNC_DISTANCE || targetDistance > MAX_DESYNC_DISTANCE) {
            //console.warn(`⚠️ Client out of sync - localDistance: ${localDistance}, targetDistance: ${targetDistance}`);
            // Optionally, send a message back to the client
            // this.chatManager.whisperChatMessage('⚠️ Shot not registered (client out of sync)', localPlayer.socket);
            return;
        }

        // Apply damage
        targetPlayer.health -= data.damage;
        targetPlayer.lastDamageTime = Date.now() / 1000;
        targetPlayer.idLastDamagedBy = localPlayer.id;

        if (targetPlayer.health <= 0) {
            const killerName = localPlayer.name;
            const killedName = targetPlayer.name;
            this.chatManager.broadcastChat(`${killerName} &fkilled ${killedName}`);
            console.log(`💔 ${killerName} killed ${killedName}`);
            this.playerManager.respawnPlayer(targetPlayer);
        }

        // Update player data
        this.playerManager.addOrUpdatePlayer(targetPlayer);
    }
}