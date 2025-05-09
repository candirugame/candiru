import { Application, Router, send } from '@oak/oak';
import { Server } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import config from './config.ts';
import { serve } from 'https://deno.land/std@0.150.0/http/server.ts';

import { GameEngine } from './GameEngine.ts';
import { PlayerManager } from './managers/PlayerManager.ts';
import { ItemManager } from './managers/ItemManager.ts';
import { ChatManager } from './managers/ChatManager.ts';
import { DamageSystem } from './managers/DamageSystem.ts';
import { MapData } from './models/MapData.ts';
import { DataValidator } from './DataValidator.ts';
import { CustomServer } from '../shared/messages.ts';
import { PeerManager } from './managers/PeerManager.ts';
import { PropManager } from './managers/PropManager.ts';

export class GameServer {
	router: Router = new Router();
	app: Application = new Application();
	io: CustomServer = new Server();

	gameEngine: GameEngine;
	playerManager: PlayerManager;
	itemManager: ItemManager;
	chatManager: ChatManager;
	damageSystem: DamageSystem;
	mapData: MapData;
	peerManager: PeerManager;
	propManager: PropManager;

	constructor() {
		this.mapData = this.loadMapData();
		this.playerManager = new PlayerManager(this.mapData);
		this.chatManager = new ChatManager(this.io, this.playerManager);
		this.itemManager = new ItemManager(this.mapData, this.playerManager, this.chatManager);
		this.damageSystem = new DamageSystem(this.playerManager, this.chatManager);
		this.propManager = new PropManager(this.mapData);

		this.playerManager.setItemManager(this.itemManager);

		this.peerManager = new PeerManager();

		this.setupSocketIO();
		this.setupRoutes();

		this.gameEngine = new GameEngine(
			this.playerManager,
			this.propManager,
			this.itemManager,
			this.chatManager,
			this.damageSystem,
			this.io,
		);
		this.itemManager.setGamemode(this.gameEngine.gamemode);
		this.damageSystem.setGameEngine(this.gameEngine);
		this.playerManager.setGameEngine(this.gameEngine);
		this.gameEngine.start();

		DataValidator.updateServerVersion();
		this.start();
	}

	private setupSocketIO() {
		this.io.on('connection', (socket) => {
			if (socket.connected) {
				// deno-lint-ignore require-await
				socket.on('playerData', async (data) => {
					try {
						const result = this.playerManager.addOrUpdatePlayer(data);
						if (result.isNew) {
							if (this.gameEngine.gamemode) this.gameEngine.gamemode.onPlayerConnect(result.player);
							this.chatManager.broadcastChat(`${result.player.name} joined`);
							console.log(`🟢 ${result.player.name}(${result.player.id}) joined`);
							this.gameEngine.emitServerInfo();
						}
					} catch (err) {
						console.log(`Error handling playerData:`, err);
					}
				});

				// deno-lint-ignore require-await
				socket.on('chatMsg', async (data) => {
					try {
						this.chatManager.handleChatMessage(data, socket);
					} catch (err) {
						console.error(`Error handling chat message:`, err);
					}
				});

				socket.on('applyDamage', (data) => {
					try {
						this.damageSystem.handleDamageRequest(data);
					} catch (err) {
						console.log(`Error handling damage request:`, err);
					}
				});

				socket.on('latencyTest', () => {
					try {
						socket.emit('latencyTest');
					} catch (err) {
						console.error(`Error handling latency test:`, err);
					}
				});

				socket.on('getServerList', (callback) => {
					const servers = this.peerManager.peers;
					//.filter((p) => p.serverInfo && p.serverInfo.gameMode !== 'bridge')
					//	.map((p) => ({
					//		info: p.serverInfo!, // Use non-null assertion to ensure info is defined
					//	}));
					callback(servers);
				});

				socket.on('disconnect', () => {
					//console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`); //reason is passed
				});
			}
		});
	}

	private setupRoutes() {
		this.router.get('/api/getInfo', (context) => {
			try {
				context.response.type = 'application/json';
				context.response.body = this.gameEngine.serverInfo;
			} catch (err) {
				console.error('Error getting server info via API:', err);
			}
		});

		this.router.get('/(.*)', async (context) => {
			try {
				await send(context, context.params[0], {
					root: `${import.meta.dirname}/../../dist`,
					index: 'index.html',
				});
			} catch {
				try {
					await send(context, 'index.html', {
						root: `${import.meta.dirname}/../../dist`,
					});
				} catch (err) {
					console.error('Error serving files:', err);
					context.response.status = 500;
					context.response.body = 'Internal Server Error';
				}
			}
		});

		this.router.get('/api/healthcheck', (context) => {
			const secret = context.request.headers.get('X-Health-Secret');
			if (secret === this.peerManager.healthSecret) {
				context.response.status = 200;
			} else {
				context.response.status = 403;
			}
		});

		this.router.post('/api/shareServerList', async (context) => {
			try {
				const body = await context.request.body.json();
				const urls: string[] = Array.isArray(body) ? body : [];
				this.peerManager.handleIncomingServers(urls);
				context.response.status = 200;
			} catch {
				context.response.status = 400;
			}
		});

		this.app.use(this.router.routes());
		this.app.use(this.router.allowedMethods());
	}

	private async start() {
		try {
			const handler = this.io.handler(async (req: Request) => {
				try {
					return await this.app.handle(req) || new Response(null, { status: 404 });
				} catch (error) {
					console.error('Request handler error:', error);
					return new Response('Internal Server Error', { status: 500 });
				}
			});

			await serve(handler, {
				port: config.server.port,
				hostname: config.server.hostname,
			});
		} catch (error) {
			console.error('Failed to start server:', error);
			Deno.exit(1);
		}
	}

	private loadMapData(): MapData {
		try {
			const mapJson = Deno.readTextFileSync(
				new URL(`../../dist/maps/${config.server.defaultMap}/map.json`, import.meta.url),
			);
			const mapObj = JSON.parse(mapJson);
			return MapData.fromJSON(mapObj);
		} catch (error) {
			console.error('Failed to load map data:', error);
			return new MapData('default_map', [], []);
		}
	}
}
