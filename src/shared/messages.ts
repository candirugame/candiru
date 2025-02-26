import type { Server, Socket } from 'https://deno.land/x/socket_io@0.2.0/mod.ts';
import type { Socket as ClientSocket } from 'socket.io-client';
import type { ChatMessage } from '../server/models/ChatMessage.ts';
import type { ServerInfo } from '../server/models/ServerInfo.ts';
import type { WorldItem } from '../server/models/WorldItem.ts';
import type { DamageRequest } from '../server/models/DamageRequest.ts';
import type { PlayerData } from './Player.ts';
import * as THREE from 'three';

export type CustomServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type CustomSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export type CustomClientSocket = ClientSocket<
	ServerToClientEvents,
	ClientToServerEvents
>;

interface ServerToClientEvents {
	serverInfo: (info: ServerInfo) => void;
	chatMsg: (message: ChatMessage) => void;
	remotePlayerData: (players: PlayerData[]) => void;
	worldItemData: (items: WorldItem[]) => void;
	latencyTest: () => void;
	particleEmit: (options: {
		position: THREE.Vector3;
		count: number;
		velocity: THREE.Vector3;
		spread: number;
		lifetime: number;
		size: number;
		color: THREE.Color;
	}) => void;
}

interface ClientToServerEvents {
	playerData: (player: PlayerData) => void;
	chatMsg: (message: ChatMessage) => void;
	applyDamage: (damage: DamageRequest) => void;
	latencyTest: () => void;
	getServerList: (callback: (servers: Array<{ url: string; info: ServerInfo }>) => void) => void;
}
