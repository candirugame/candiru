import { FFAGamemode } from './FFAGamemode.ts';

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

	override onPlayerConnect(): void {
		//super.onPlayerConnect(player);
		// Additional connection logic if needed
	}

	override onPlayerDisconnect(): void {
		//super.onPlayerDisconnect(player);
		// Additional disconnection logic if needed
	}

	override onPlayerDeath(): void {
		//super.onPlayerDeath(player);
		// Additional death logic if needed
	}

	override onPlayerKill(): void {
		//super.onPlayerKill(player);
		// Additional kill logic if needed
	}

	override onItemPickup(): void {
		//super.onItemPickup(player);
	}
}
