import { Application, Router, send } from "@oak/oak";
import { Server, Socket } from "https://deno.land/x/socket_io@0.2.0/mod.ts";
import config from './config.ts';
import { serve } from "https://deno.land/std@0.150.0/http/server.ts";

// Import Managers and GameEngine
import { GameEngine } from './GameEngine.ts';
import { PlayerManager } from './managers/PlayerManager.ts';
import { ItemManager } from './managers/ItemManager.ts';
import { ChatManager } from './managers/ChatManager.ts';
import { DamageSystem } from './managers/DamageSystem.ts';
import { MapData } from './models/MapData.ts';

export class GameServer {
    router: Router = new Router();
    app: Application = new Application();
    io: Server = new Server();

    // Managers and Engine
    gameEngine: GameEngine;
    playerManager: PlayerManager;
    itemManager: ItemManager;
    chatManager: ChatManager;
    damageSystem: DamageSystem;
    mapData: MapData;

    constructor() {
        // Initialize Map Data
        this.mapData = this.loadMapData();

        // Initialize Managers
        this.playerManager = new PlayerManager(this.mapData);
        this.chatManager = new ChatManager(this.io);
        this.itemManager = new ItemManager(this.mapData, this.playerManager, this.chatManager);
        this.damageSystem = new DamageSystem(this.playerManager, this.chatManager);

        // Set up Socket.IO and Routes
        this.setupSocketIO();
        this.setupRoutes();

        // Initialize and Start GameEngine
        this.gameEngine = new GameEngine(
            this.playerManager,
            this.itemManager,
            this.chatManager,
            this.damageSystem,
            this.io
        );
        this.gameEngine.start();

        // Start the Server
        this.start();
    }

    private setupSocketIO() {
        this.io.on("connection", (socket: Socket) => {
            console.log(`Socket connected: ${socket.id}`);

            // Handle player data updates
            socket.on("playerData", (data) => {
                try {
                    const result = this.playerManager.addOrUpdatePlayer(data);
                    if (result.isNew && result.player) {
                        this.chatManager.broadcastChat(`${result.player.name} joined`);
                    }
                } catch (err) {
                    console.error(`Error updating player data` + err);
                }
            });

            // Handle chat messages
            socket.on("chatMsg", (data) => this.chatManager.handleChatMessage(data, socket));

            // Handle damage requests
            socket.on("applyDamage", (data) => {
                this.damageSystem.handleDamageRequest(data);
            });

            // In GameServer.ts, inside setupSocketIO()

            socket.on('latencyTest', () => {
                socket.emit('latencyTest', 'response :)');
            });

            // Handle disconnections
            socket.on("disconnect", (reason) => {
                // Assuming player ID is mapped to socket ID
                const playerId = Number(socket.id); // Adjust based on your implementation
                const player = this.playerManager.getPlayerById(playerId);
                if (player) {
                    this.playerManager.removePlayer(playerId);
                    this.chatManager.broadcastChat(`${player.name} left the game.`);
                    console.log(`🟠 ${player.name}(${player.id}) disconnected: ${reason}`);
                }
            });
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
                await send(context, "index.html", {
                    root: `${Deno.cwd()}/dist`,
                });
            }
        });

        this.app.use(this.router.routes());
        this.app.use(this.router.allowedMethods());
    }

    private async start() {
        const handler = this.io.handler(async (req: Request) => {
            return await this.app.handle(req) || new Response(null, { status: 404 });
        });

        await serve(handler, {
            port: config.server.port,
        });
    }


    private loadMapData(): MapData {
        // Implement map data loading logic
        // For example, load from a JSON file
        try {
            const mapJson = Deno.readTextFileSync(`./dist/maps/${config.server.defaultMap}/map.json`); // Adjust the path as needed
            const mapObj = JSON.parse(mapJson);
            return MapData.fromJSON(mapObj);
        } catch (error) {
            console.error("Failed to load map data:", error);
            // Fallback to default map data if needed
            return new MapData('default_map', [], []);
        }
    }
}