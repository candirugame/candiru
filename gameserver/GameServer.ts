import { Application, Router, send } from "@oak/oak";
import { Server } from "https://deno.land/x/socket_io@0.2.0/mod.ts";
import config from './config.ts';
import { ConnInfo } from "https://deno.land/std@0.150.0/http/server.ts";

export class GameServer {
    router: Router = new Router();
    app: Application = new Application();
    io: Server = new Server();

    constructor() {
        this.setupSocketIO();
        this.setupRoutes();
        this.start();
    }

    private setupSocketIO() {
        this.io.on("connection", (socket) => {
            socket.on("disconnect", (reason) => {
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
        const handler = this.io.handler(async (req: Request, connInfo: ConnInfo) => {
            const response = await this.app.handle(req);
            return response || new Response(null, { status: 404 });
        });

        // console.log(config.server.port);
        // console.log(config.player.baseInventory);
        // console.log(config.health.regenRate);

        await Deno.serve({
            hostname: "localhost",
            port: config.server.port,
        }, async (request: Request, connectInfo: Deno.ServeHandlerInfo) => {
            // Convert ServeHandlerInfo to ConnInfo
            const connInfo: ConnInfo = {
                localAddr: {
                    transport: "tcp",
                    hostname: "localhost",
                    port: config.server.port
                },
                remoteAddr: connectInfo.remoteAddr
            };
            return await handler(request, connInfo);
        }).finished;
    }



}
