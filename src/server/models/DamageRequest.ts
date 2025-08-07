import { PlayerData } from '../../shared/Player.ts';

export interface DamageRequest {
	localPlayer: PlayerData;
	targetPlayer: PlayerData;
	damage: number;
	wasHeadshot: boolean;
}
