import { Application, Router, send } from "@oak/oak";
import { Server, Socket } from "https://deno.land/x/socket_io@0.2.0/mod.ts";
import config from './config.ts';
import { serve } from "https://deno.land/std@0.150.0/http/server.ts";

import { GameEngine } from './GameEngine.ts';
import { PlayerManager } from './managers/PlayerManager.ts';
import { ItemManager } from './managers/ItemManager.ts';
import { ChatManager } from './managers/ChatManager.ts';
import { DamageSystem } from './managers/DamageSystem.ts';
import { MapData } from './models/MapData.ts';
import { DataValidator } from "./DataValidator.ts";

export class GameServer {
    router: Router = new Router();
    app: Application = new Application();
    io: Server = new Server();

    gameEngine: GameEngine;
    playerManager: PlayerManager;
    itemManager: ItemManager;
    chatManager: ChatManager;
    damageSystem: DamageSystem;
    mapData: MapData;

    constructor() {
        this.mapData = this.loadMapData();
        this.playerManager = new PlayerManager(this.mapData);
        this.chatManager = new ChatManager(this.io, this.playerManager);
        this.itemManager = new ItemManager(this.mapData, this.playerManager, this.chatManager);
        this.damageSystem = new DamageSystem(this.playerManager, this.chatManager);

        this.setupSocketIO();
        this.setupRoutes();

        this.gameEngine = new GameEngine(
            this.playerManager,
            this.itemManager,
            this.chatManager,
            this.damageSystem,
            this.io
        );
        this.gameEngine.start();

        DataValidator.updateServerVersion();
        this.start();
    }

    private setupSocketIO() {
        this.io.on("connection", (socket: Socket) => {
            if (socket.connected) {
                console.log(`Socket connected: ${socket.id}`);

                socket.on("error", (error) => {
                    console.error(`Socket error for ${socket.id}:`, error);
                });

                socket.on("playerData", async (data) => {
                    try {
                        const result = this.playerManager.addOrUpdatePlayer(data);
                        if (result.isNew && result.player) {
                            await this.chatManager.broadcastChat(`${result.player.name} joined`);
                            console.log(`🟢 ${result.player.name}(${result.player.id}) joined`);
                        }
                    } catch (err) {
                        console.error(`Error handling playerData:`, err);
                    }
                });

                socket.on("chatMsg", async (data) => {
                    try {
                        await this.chatManager.handleChatMessage(data, socket);
                    } catch (err) {
                        console.error(`Error handling chat message:`, err);
                    }
                });

                socket.on("applyDamage", (data) => {
                    try {
                        this.damageSystem.handleDamageRequest(data);
                    } catch (err) {
                        console.error(`Error handling damage request:`, err);
                    }
                });

                socket.on('latencyTest', () => {
                    try {
                        socket.emit('latencyTest', 'response :)');
                    } catch (err) {
                        console.error(`Error handling latency test:`, err);
                    }
                });

                socket.on("disconnect", (reason) => {
                    console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
                });
            }
        });
    }

    private setupRoutes() {
        this.router.get("/(.*)", async (context) => {
            try {
                await send(context, context.params[0], {
                    root: `${Deno.cwd()}/dist`,
                    index: "index.html",
                });
            } catch {
                try {
                    await send(context, "index.html", {
                        root: `${Deno.cwd()}/dist`,
                    });
                } catch (err) {
                    console.error('Error serving files:', err);
                    context.response.status = 500;
                    context.response.body = "Internal Server Error";
                }
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
                port: config.server.port
            });
        } catch (error) {
            console.error('Failed to start server:', error);
            Deno.exit(1);
        }
    }

    private loadMapData(): MapData {
        try {
            const mapJson = Deno.readTextFileSync(`./dist/maps/${config.server.defaultMap}/map.json`);
            const mapObj = JSON.parse(mapJson);
            return MapData.fromJSON(mapObj);
        } catch (error) {
            console.error("Failed to load map data:", error);
            return new MapData('default_map', [], []);
        }
    }
}
