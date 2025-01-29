import { FFAGamemode } from './FFAGamemode.ts';
import { Player } from '../../shared/Player.ts';

export class BridgeGamemode extends FFAGamemode {
	private readonly FLAG_ITEM_TYPE: number = 4;

	override init(): void {
		super.init();
		console.log('🖥️ Bridge Gamemode initialized');
	}

	override tick(): void {
		super.tick();
	}

	override onPeriodicCleanup(): void {
		// send msg to all players
		for (const player of this.gameEngine.playerManager.getAllPlayers()) {
			player.gameMsgs[0] = '&cThis is a &bbridge server&c, intended to facilitate server peer discovery.';
			player.gameMsgs[1] = '&cTo play Candiru, press escape and select a server from the list.';
		}
	}

	override onPlayerConnect(player: Player): void {
		//super.onPlayerConnect(player);
		// Additional connection logic if needed
	}

	override onPlayerDisconnect(player: Player): void {
		//super.onPlayerDisconnect(player);
		// Additional disconnection logic if needed
	}

	override onPlayerDeath(player: Player): void {
		//super.onPlayerDeath(player);
		// Additional death logic if needed
	}

	override onPlayerKill(player: Player): void {
		//super.onPlayerKill(player);
		// Additional kill logic if needed
	}

	override onItemPickup(player: Player): void {
		//super.onItemPickup(player);
	}
}
