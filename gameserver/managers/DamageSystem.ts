import { DataValidator } from "../DataValidator.ts";
import { DamageRequest } from "../models/DamageRequest.ts";
import { ChatManager } from "./ChatManager.ts";
import { PlayerManager } from "./PlayerManager.ts";

export class DamageSystem {
    constructor(private playerManager: PlayerManager, private chatManager: ChatManager) {}

    handleDamageRequest(data: DamageRequest) {
        const { error } = DataValidator.validateDamageRequest(data);
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
        // Calculate distance
        const distance = targetPlayer.position.distanceTo(localPlayer.position);
        if (distance > 1) {
            console.warn('Players are out of range.');
            return;
        }

        // Apply damage
        targetPlayer.health -= data.damage;
        targetPlayer.lastDamageTime = Date.now() / 1000;
        targetPlayer.idLastDamagedBy = localPlayer.id;

        if (targetPlayer.health <= 0) {
            const killerName = localPlayer.name;
            const killedName = targetPlayer.name;
            this.chatManager.broadcastChat(`${killerName} killed ${killedName}`);
            this.playerManager.respawnPlayer(targetPlayer);
        }

        // Update player data
        this.playerManager.addOrUpdatePlayer(targetPlayer);
    }
}