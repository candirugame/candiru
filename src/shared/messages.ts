import type { Server, Socket } from "https://deno.land/x/socket_io@0.2.0/mod.ts";
import type { Socket as ClientSocket } from "socket.io-client";
import type { ChatMessage } from "../server/models/ChatMessage.ts";
import type { ServerInfo } from "../server/models/ServerInfo.ts";
import type { WorldItem } from "../server/models/WorldItem.ts";

export type CustomServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type CustomSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export type CustomClientSocket = ClientSocket<
	ServerToClientEvents,
	ClientToServerEvents
>;

interface ServerToClientEvents {
	serverInfo: (info: ServerInfo) => void;
	chatMsg: (message: ChatMessage) => void;
	// deno-lint-ignore no-explicit-any
	remotePlayerData: (players: any[]) => void;
	worldItemData: (items: WorldItem[]) => void;
	latencyTest: () => void;
}

interface ClientToServerEvents {
	// deno-lint-ignore no-explicit-any
	playerData: (player: any) => void;
	chatMsg: (message: ChatMessage) => void;
	// deno-lint-ignore no-explicit-any
	applyDamage: (damage: any) => void;
	latencyTest: () => void;
}
