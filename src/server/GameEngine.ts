import { ChatManager } from './managers/ChatManager.ts';
import { DamageSystem } from './managers/DamageSystem.ts';
import { ItemManager } from './managers/ItemManager.ts';
import { PlayerManager } from './managers/PlayerManager.ts';
import config from './config.ts';
import { ServerInfo } from './models/ServerInfo.ts';
import { DataValidator } from './DataValidator.ts';
import { Gamemode } from './gamemodes/Gamemode.ts';
import { FFAGamemode } from './gamemodes/FFAGamemode.ts';
import { CustomServer } from '../shared/messages.ts';
import { Player } from '../shared/Player.ts';
import type { PlayerData } from '../shared/Player.ts';
import * as THREE from 'three';
import { SoloCTFGamemode } from './gamemodes/SoloCTFGamemode.ts';
import { BridgeGamemode } from './gamemodes/BridgeGamemode.ts';
import { KingOfTheHillGamemode } from './gamemodes/KingOfTheHillGamemode.ts';

export class GameEngine {
	private lastPlayerTickTimestamp: number = Date.now() / 1000;
	private lastFullPlayerEmitTimestamp: number = Date.now() / 1000;
	private lastEmittedPlayerSnapshot: Map<number, PlayerData> = new Map();
	private fullPlayerEmitInterval: number = config.server.fullPlayerEmitInterval / 1000; // seconds
	private lastItemUpdateTimestamp: number = Date.now() / 1000;
	public playerUpdateSinceLastEmit: boolean = false;
	private itemUpdateSinceLastEmit: boolean = false;
	public serverInfo: ServerInfo = new ServerInfo();
	public gamemode: Gamemode | false = false;

	private tickProfileSamples: number = 0;
	private tickProfileTime: number = 0;
	private cleanupProfileSamples: number = 0;
	private cleanupProfileTime: number = 0;

	constructor(
		public playerManager: PlayerManager,
		public itemManager: ItemManager,
		public chatManager: ChatManager,
		private damageSystem: DamageSystem,
		private io: CustomServer,
	) {}

	start() {
		setInterval(() => this.serverTick(), 1000 / config.server.tickRate);
		setInterval(() => this.periodicCleanup(), config.server.cleanupInterval);
		setInterval(() => this.emitServerInfo(), config.server.cleanupInterval);
		this.initGamemode();
	}

	private serverTick() {
		try {
			const currentTime = Date.now() / 1000;
			this.playerManager.regenerateHealth();
			this.itemManager.tick(currentTime);
			if (this.gamemode) this.gamemode.tick();

			// Emit player data (full or delta) if there are updates or enough time has passed
			if (this.playerUpdateSinceLastEmit || currentTime - this.lastPlayerTickTimestamp > 1 / config.server.tickRate) {
				try {
					const players = this.playerManager.getAllPlayers();
					// decide full snapshot or delta
					if (currentTime - this.lastFullPlayerEmitTimestamp > this.fullPlayerEmitInterval) {
						// full state emit
						const fullData = players.map((p) => p.toJSON());
						this.io.volatile.emit('remotePlayerData', fullData);
						this.lastFullPlayerEmitTimestamp = currentTime;
						this.lastEmittedPlayerSnapshot.clear();
						fullData.forEach((pd) => this.lastEmittedPlayerSnapshot.set(pd.id, pd));
					} else {
						// delta emit
						const currentData = players.map((p) => p.toJSON());
						const deltas: Array<Partial<PlayerData> & { id: number }> = [];
						currentData.forEach((pd) => {
							const prev = this.lastEmittedPlayerSnapshot.get(pd.id);
							const delta: Partial<PlayerData> & { id: number } = { id: pd.id };
							if (!prev) {
								deltas.push(pd);
								this.lastEmittedPlayerSnapshot.set(pd.id, pd);
							} else {
								// iterate over known keys in PlayerData
								(Object.keys(pd) as Array<keyof PlayerData>).forEach((key) => {
									const curVal = JSON.stringify(pd[key]);
									const prevVal = JSON.stringify(prev[key]);
									if (curVal !== prevVal) {
										// assign via any-cast to satisfy TS
										// deno-lint-ignore no-explicit-any
										(delta as any)[key] = pd[key];
									}
								});
								if (Object.keys(delta).length > 1) {
									deltas.push(delta);
									this.lastEmittedPlayerSnapshot.set(pd.id, pd);
								}
							}
						});
						if (deltas.length > 0) {
							this.io.volatile.emit('remotePlayerDelta', deltas);
						}
					}
					this.playerUpdateSinceLastEmit = false;
					this.lastPlayerTickTimestamp = currentTime;
				} catch (err) {
					console.error('⚠ error emitting player data:', err);
				}
			}

			// Emit item data if there are updates
			if (this.itemUpdateSinceLastEmit || this.itemManager.hasUpdates()) {
				try {
					this.io.emit('worldItemData', this.itemManager.getAllItems());
					this.itemUpdateSinceLastEmit = false;
				} catch (err) {
					console.error('⚠ error emitting item data:', err);
				}
			}

			this.tickProfileSamples++;
			this.tickProfileTime += Date.now() / 1000 - currentTime;
			if (this.tickProfileSamples >= 100) {
				this.serverInfo.tickComputeTime = this.tickProfileTime / this.tickProfileSamples;
				this.tickProfileSamples = 0;
				this.tickProfileTime = 0;
			}
		} catch (error) {
			console.error('⚠ error in serverTick:', error);
		}
	}

	public periodicCleanup() {
		// for(const player of this.playerManager.getAllPlayers())
		//         console.log(player.gameMsgs)

		try {
			const currentTime = Date.now() / 1000;
			const players = this.playerManager.getAllPlayers();

			players.forEach((player) => {
				if (player.position.y < -150) {
					player.health = 0;
					player.velocity = new THREE.Vector3(0, 0, 0);
					this.chatManager.broadcastChat(`${player.name} fell off :'(`);
					console.log(`💔 ${player.name}(${player.id}) fell off the map`);
				}

				if (player.health <= 0) {
					if (this.gamemode) this.gamemode.onPlayerDeath(player); //gamemode now handles
					else this.playerManager.respawnPlayer(player);
				}

				if ((player.updateTimestamp || 0) + config.player.disconnectTime < currentTime) {
					if (this.gamemode) this.gamemode.onPlayerDisconnect(player);
					console.log(`🟠 ${player.name}(${player.id}) left`);
					this.chatManager.broadcastChat(`${player.name} left`);
					this.playerManager.removePlayer(player.id);
				}
			});

			const playerData = this.playerManager.getAllPlayerData();
			playerData.forEach((playerData) => {
				for (let i = 0; i < playerData.extras.gameMsgsTimeouts.length; i++) {
					if (
						playerData.extras.gameMsgsTimeouts[i] &&
						currentTime > playerData.extras.gameMsgsTimeouts[i] && playerData.extras.gameMsgsTimeouts[i] !== -1
					) {
						playerData.player.gameMsgs[i] = '';
						playerData.extras.gameMsgsTimeouts[i] = -1;
						this.playerUpdateSinceLastEmit = true;
					}
				}
			});

			const items = this.itemManager.getAllItems();
			items.forEach((item) => {
				if (item.vector.y < -5) {
					this.itemManager.removeItem(item.id);
					this.itemUpdateSinceLastEmit = true;
				}
			});

			if (this.gamemode) this.gamemode.onPeriodicCleanup();

			this.cleanupProfileSamples++;
			this.cleanupProfileTime += Date.now() / 1000 - currentTime;
			if (this.cleanupProfileSamples >= 10) {
				this.serverInfo.cleanupComputeTime = this.cleanupProfileTime / this.cleanupProfileSamples;
				this.cleanupProfileSamples = 0;
				this.cleanupProfileTime = 0;
			}
		} catch (error) {
			console.error('⚠ error in periodicCleanup:', error);
		}
	}

	// Method to emit server info to all clients
	public emitServerInfo() {
		this.serverInfo.version = DataValidator.getServerVersion();
		this.serverInfo.currentPlayers = this.playerManager.getAllPlayers().length;
		this.serverInfo.memUsageRss = Deno.memoryUsage().rss / 1024 / 1024;
		this.serverInfo.memUsageHeapUsed = Deno.memoryUsage().heapUsed / 1024 / 1024;
		this.serverInfo.memUsageHeapTotal = Deno.memoryUsage().heapTotal / 1024 / 1024;
		this.serverInfo.memUsageExternal = Deno.memoryUsage().external / 1024 / 1024;

		this.io.emit('serverInfo', this.serverInfo);
	}

	public emitParticleData(data: {
		position: THREE.Vector3;
		count: number;
		velocity: THREE.Vector3;
		spread: number;
		lifetime: number;
		size: number;
		color: THREE.Color;
	}) {
		this.io.emit('particleEmit', data);
	}

	public setGameMessage(player: Player, message: string, index: number, timeout?: number) {
		player.gameMsgs[index] = message;
		const extras = this.playerManager.getPlayerExtrasById(player.id);
		if (timeout && timeout > 0 && extras) {
			extras.gameMsgsTimeouts[index] = Date.now() / 1000 + timeout;
		}
	}

	private initGamemode() {
		try {
			switch (config.game.mode) {
				case 'ffa':
					this.gamemode = new FFAGamemode(this);
					break;
				case 'ctf':
					this.gamemode = new SoloCTFGamemode(this);
					break;
				case 'koth':
					this.gamemode = new KingOfTheHillGamemode(this);
					break;
				case 'bridge':
					this.gamemode = new BridgeGamemode(this);
					break;
				default:
					console.log('⚠️ invalid gamemode supplied (check your config!)', config.game.mode);
					break;
			}
		} catch (error) {
			console.error('⚠️ error initializing gamemode:', error);
		}
	}
}
