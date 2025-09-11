import * as THREE from 'three';
import { io } from 'socket.io-client';
import { ChatOverlay } from '../ui/ChatOverlay.ts';
import { CustomClientSocket } from '../../shared/messages.ts';
import { Player, PlayerData } from '../../shared/Player.ts';
import type { InventoryItem } from '../../shared/InventoryItem.ts';
import { Peer } from '../../server/models/Peer.ts';
import { PropData } from '../../shared/Prop.ts';
import { clearCacheAndReload } from './cache.ts';
import { Trajectory } from '../input/Trajectory.ts';

interface WorldItem {
	vector: { x: number; y: number; z: number };
	id: number;
	itemType: number;
	// Optional initial trajectory data serialized from server WorldItem.initTrajectory
	initTrajectory?: {
		points: { x: number; y: number; z: number }[];
		dt: number;
		hits: { point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; index: number }[];
	};
	// List of player IDs that should not see the trajectory phase of this item
	playerIdsTrajectoryHiddenFrom?: number[];
}

export interface ServerInfo {
	name: string;
	maxPlayers: number;
	currentPlayers: number;
	mapName: string;
	tickRate: number;
	version: string;
	gameMode: string;
	playerMaxHealth: number;
	skyColor: string;
	tickComputeTime: number;
	cleanupComputeTime: number;
	url: string;
	memUsageRss: number;
	memUsageHeapUsed: number;
	memUsageHeapTotal: number;
	memUsageExternal: number;
	idleKickTime: number;
}

interface LastUploadedLocalPlayer {
	position: THREE.Vector3;
	lookQuaternion: THREE.Quaternion;
	chatMsg: string;
	velocity: THREE.Vector3;
	name: string;
	heldItemIndex: number;
	rightClickHeld: boolean;
	shooting: boolean;
}

// A precise partial type for player deltas where top-level properties are optional,
// but inventory (when present) is a fully-typed InventoryItem[]
export class Networking {
	private socket: CustomClientSocket;
	private gameVersion: string = '';
	private remotePlayers: PlayerData[] = [];
	private props: PropData[] = [];
	private worldItems: WorldItem[] = [];
	private lastUploadedLocalPlayer: LastUploadedLocalPlayer | null = null;
	private lastUploadTime: number;
	private uploadWait: number;
	private lastLatencyTestEmit: number;
	private lastLatencyTestGotResponse: boolean;
	private latencyTestWait: number;
	private messagesBeingTyped: string[] = [];
	private localPlayer: Player;
	private chatOverlay: ChatOverlay;
	private damagedTimestamp: number = 0;
	public severelyDamagedTimestamp: number = 0;
	private serverInfo: ServerInfo;
	private lastRealUpdateTime: number = 0;
	public particleQueue: {
		position: THREE.Vector3;
		count: number;
		velocity: THREE.Vector3;
		spread: number;
		lifetime: number;
		size: number;
		color: THREE.Color;
	}[] = [];

	constructor(localPlayer: Player, chatOverlay: ChatOverlay) {
		this.localPlayer = localPlayer;
		this.chatOverlay = chatOverlay;

		this.socket = io();
		this.fetchVersion();

		this.lastUploadTime = Date.now() / 1000;
		this.uploadWait = 0.05; //gets replaced by server info
		this.lastLatencyTestEmit = 0;
		this.lastLatencyTestGotResponse = false;
		this.latencyTestWait = 5;

		this.serverInfo = {
			name: '',
			maxPlayers: 0,
			currentPlayers: 0,
			mapName: '',
			tickRate: 0,
			version: '',
			gameMode: '',
			playerMaxHealth: 100,
			skyColor: '#000000',
			tickComputeTime: 0,
			cleanupComputeTime: 0,
			url: '',
			memUsageRss: 0,
			memUsageHeapUsed: 0,
			memUsageHeapTotal: 0,
			memUsageExternal: 0,
			idleKickTime: 60,
		};

		this.setupSocketListeners();
	}

	public destroy() {
		this.socket.disconnect();
		this.socket.removeAllListeners();
		this.remotePlayers = [];
		this.props = [];
		this.worldItems = [];
		this.particleQueue = [];
		this.messagesBeingTyped = [];
		this.lastUploadedLocalPlayer = null;
		this.lastUploadTime = 0;
	}

	private async fetchVersion() {
		try {
			const response = await fetch('gameVersion.json');
			const data = await response.json();
			this.gameVersion = data['version'];
		} catch (e) {
			console.error(e);
		}
	}

	public fetchServerList(callback: (servers: Peer[]) => void) {
		this.socket.emit('getServerList', callback);
	}

	private forcedZoomTriggered: boolean = false;
	public forcedZoomTick(): boolean {
		if (this.forcedZoomTriggered) {
			this.forcedZoomTriggered = false;
			return true;
		}
		return false;
	}

	// Type guard to validate inventory arrays at runtime
	private isInventoryArray(val: unknown): val is InventoryItem[] {
		return Array.isArray(val) && val.every((raw): raw is InventoryItem => {
			if (raw === null || typeof raw !== 'object') return false;
			const it = raw as Record<string, unknown>;
			return (
				typeof it.itemId === 'number' &&
				typeof it.durability === 'number' &&
				typeof it.creationTimestamp === 'number' &&
				typeof it.shotsFired === 'number' &&
				(it.lifetime === undefined || typeof it.lifetime === 'number') &&
				(it.shotsAvailable === undefined || typeof it.shotsAvailable === 'number')
			);
		});
	}

	// Updates the local player state based on received data (full or partial)
	private updateLocalPlayerState(data: Partial<PlayerData>) {
		// Forced position/velocity/look updates
		if (data.forced) {
			if (data.position) this.localPlayer.position.set(data.position.x, data.position.y, data.position.z);
			if (data.velocity) this.localPlayer.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
			if (data.lookQuaternion) {
				this.localPlayer.lookQuaternion.set(
					data.lookQuaternion.x,
					data.lookQuaternion.y,
					data.lookQuaternion.z,
					data.lookQuaternion.w,
				);
			}
			if (data.gravity !== undefined) this.localPlayer.gravity = data.gravity;
			this.forcedZoomTriggered = true;
			this.localPlayer.forcedAcknowledged = true;
		} else if (data.forced === false) {
			this.localPlayer.forcedAcknowledged = false;
		}

		// Health update
		if (data.health !== undefined) {
			if (data.health < this.localPlayer.health) {
				this.damagedTimestamp = Date.now() / 1000;
				if (this.localPlayer.health - data.health > 80) this.severelyDamagedTimestamp = Date.now() / 1000;
			}
			this.localPlayer.health = data.health;
		}

		// Optional fields: Only update if present in data
		if (data.inventory !== undefined) {
			if (this.isInventoryArray(data.inventory)) {
				this.localPlayer.inventory = data.inventory;
			} else {
				// Invalid payload shape; ignore inventory update to preserve type safety
				console.warn('Ignoring invalid inventory payload');
			}
		}
		if (data.gameMsgs !== undefined) {
			this.localPlayer.gameMsgs = data.gameMsgs;
		}
		if (data.gameMsgs2 !== undefined) {
			this.localPlayer.gameMsgs2 = data.gameMsgs2;
		}
		if (data.directionIndicatorVector !== undefined) {
			this.localPlayer.directionIndicatorVector = data.directionIndicatorVector
				? new THREE.Vector3(
					data.directionIndicatorVector.x,
					data.directionIndicatorVector.y,
					data.directionIndicatorVector.z,
				)
				: undefined;
		}
		if (data.idLastDamagedBy !== undefined) {
			this.localPlayer.idLastDamagedBy = data.idLastDamagedBy;
		}
		if (data.playerSpectating !== undefined) {
			this.localPlayer.playerSpectating = data.playerSpectating;
		}
		if (data.doPhysics !== undefined) {
			this.localPlayer.doPhysics = data.doPhysics;
		}
	}

	// Processes non-local player data (chat messages, server status)
	private processNonLocalPlayerData() {
		this.messagesBeingTyped = [];
		let isLocalPlayerInList = false;

		for (const remotePlayer of this.remotePlayers) {
			if (remotePlayer.id === this.localPlayer.id) {
				isLocalPlayerInList = true;
				continue;
			}

			if (remotePlayer.chatActive) {
				this.messagesBeingTyped.push(`${remotePlayer.name}: ${remotePlayer.chatMsg}`);
			}
		}

		// Server full/version checks
		const serverInfo = this.getServerInfo();
		if (
			serverInfo.maxPlayers > 0 &&
			serverInfo.currentPlayers >= serverInfo.maxPlayers &&
			!isLocalPlayerInList
		) {
			this.localPlayer.gameMsgs = [
				`&cThe server is full. (${serverInfo.currentPlayers}/${serverInfo.maxPlayers}) `,
				`&cYou'll automatically connect when a spot opens up. `,
			];
		}
		if (
			serverInfo.version &&
			this.localPlayer.gameVersion &&
			this.localPlayer.gameVersion !== serverInfo.version
		) {
			if (!this.localPlayer.gameMsgs || this.localPlayer.gameMsgs.length === 0) {
				this.localPlayer.gameMsgs = ['&cYour client may be outdated. Try refreshing the page.'];
			}
			clearCacheAndReload();
		}
	}

	private setupSocketListeners() {
		this.socket.on('latencyTest', () => {
			this.localPlayer.latency = (Date.now() / 1000 - this.lastLatencyTestEmit) * 1000;
			this.lastLatencyTestGotResponse = true;
		});

		this.socket.on('propData', (data: PropData[]) => {
			this.props = data;
		});

		this.socket.on('propDelta', (deltas: Array<Partial<PropData> & { id: number }>) => {
			//console.log(`Received prop delta: ${JSON.stringify(deltas)}`);
			deltas.forEach((delta) => {
				const idx = this.props.findIndex((p) => p.id === delta.id);
				if (idx !== -1) {
					this.props[idx] = { ...this.props[idx], ...delta };
				}
			});
		});

		this.socket.on('remotePlayerData', (data: PlayerData[]) => {
			// Full snapshot - update local store
			this.remotePlayers = data;

			// Find and update local player data
			const localPlayerData = this.remotePlayers.find((p) => p.id === this.localPlayer.id);
			if (localPlayerData) {
				this.updateLocalPlayerState(localPlayerData);
			}

			// Process other players
			this.processNonLocalPlayerData();
		});

		this.socket.on(
			'remotePlayerDelta',
			(deltas: Array<import('../../shared/Player.ts').PlayerDelta & { id: number }>) => {
				let localPlayerDelta: (import('../../shared/Player.ts').PlayerDelta & { id: number }) | undefined;

				// Apply deltas to remotePlayers
				deltas.forEach((delta) => {
					const idx = this.remotePlayers.findIndex((p) => p.id === delta.id);
					if (idx !== -1) {
						this.remotePlayers[idx] = { ...this.remotePlayers[idx], ...delta };
						if (delta.id === this.localPlayer.id) {
							localPlayerDelta = delta;
						}
					} else {
						//	this.remotePlayers.push(delta as PlayerData);
						if (delta.id === this.localPlayer.id) {
							localPlayerDelta = delta;
						}
					}
				});

				// Update local player with delta
				if (localPlayerDelta) {
					this.updateLocalPlayerState(localPlayerDelta);
				}

				// Process other players
				this.processNonLocalPlayerData();
			},
		);

		this.socket.on('worldItemData', (data) => {
			this.worldItems = data;
			this.processWorldItemData();
		});

		this.socket.on('chatMsg', (data) => {
			if (data.id !== this.localPlayer.id) {
				this.chatOverlay.addChatMessage(data);
			}
		});

		this.socket.on('eventMsg', (msg) => {
			this.chatOverlay.addEventMessage(msg);
		});

		this.socket.on('serverInfo', (data) => {
			this.serverInfo = { ...data };
			this.onServerInfo();
		});

		this.socket.on('particleEmit', (data) => {
			this.particleQueue.push({
				position: new THREE.Vector3(data.position.x, data.position.y, data.position.z),
				velocity: new THREE.Vector3(data.velocity.x, data.velocity.y, data.velocity.z),
				count: data.count,
				spread: data.spread,
				lifetime: data.lifetime,
				size: data.size,
				color: new THREE.Color(data.color),
			});
		});
	}

	private onServerInfo() {
		this.uploadWait = 1 / this.serverInfo.tickRate;
	}

	public updatePlayerData() {
		const currentTime = Date.now() / 1000;
		this.localPlayer.gameVersion = this.gameVersion;
		if (currentTime - this.lastUploadTime < this.uploadWait) return;

		if (this.localPlayer.gameVersion === '') return;

		const equalToLastUpload = this.playersAreEqualEnough(this.localPlayer, this.lastUploadedLocalPlayer);
		if (!equalToLastUpload) this.lastRealUpdateTime = currentTime;

		if (currentTime - this.lastRealUpdateTime > this.serverInfo.idleKickTime) {
			if (!this.remotePlayers.some((player) => player.id === this.localPlayer.id)) {
				this.localPlayer.gameMsgs = ['&cdisconnected for being idle', '&cmove to reconnect'];
			}
			return;
		}

		if (equalToLastUpload && currentTime - this.lastUploadTime < 4) return;

		this.socket.volatile.emit('playerData', this.localPlayer);
		this.lastUploadedLocalPlayer = {
			position: this.localPlayer.position.clone(),
			chatMsg: this.localPlayer.chatMsg,
			velocity: this.localPlayer.velocity.clone(),
			lookQuaternion: this.localPlayer.lookQuaternion.clone(),
			name: this.localPlayer.name,
			heldItemIndex: this.localPlayer.heldItemIndex,
			rightClickHeld: this.localPlayer.rightClickHeld,
			shooting: this.localPlayer.shooting,
		};

		this.lastUploadTime = currentTime;

		if (currentTime - this.lastLatencyTestEmit > this.latencyTestWait) {
			this.socket.emit('latencyTest');
			this.lastLatencyTestEmit = currentTime;
			if (!this.lastLatencyTestGotResponse) {
				this.localPlayer.latency = 999;
			}
			this.lastLatencyTestGotResponse = false;
		}
	}

	public broadcastThrownItem(trajectory: Trajectory) {
		this.socket.emit('throwItem', {
			trajectory: trajectory,
			playerID: this.localPlayer.id,
			heldItemIndex: this.localPlayer.heldItemIndex,
		});
	}

	public processWorldItemData() {
		// Implementation for processing world items
	}

	public getServerInfo() {
		return this.serverInfo;
	}

	public getSpectatedPlayer(): PlayerData | undefined {
		if (this.localPlayer.playerSpectating === -1) return undefined;
		return this.remotePlayers.find((player) => player.id === this.localPlayer.playerSpectating);
	}

	private playersAreEqualEnough(player1: Player, player2: LastUploadedLocalPlayer | null) {
		if (player1 === null || player2 === null) return false;
		return (
			player1.position.equals(player2.position) &&
			player1.lookQuaternion.equals(player2.lookQuaternion) &&
			player1.chatMsg === player2.chatMsg &&
			player1.velocity.equals(player2.velocity) &&
			player1.name === player2.name &&
			player1.heldItemIndex === player2.heldItemIndex &&
			player1.rightClickHeld === player2.rightClickHeld &&
			player1.shooting === player2.shooting
		);
	}

	public getDamagedTimestamp() {
		return this.damagedTimestamp;
	}

	public getMessagesBeingTyped() {
		return this.messagesBeingTyped;
	}

	public getPropData(): PropData[] {
		return this.props;
	}

	public getRemotePlayerData(): PlayerData[] {
		return this.remotePlayers;
	}

	public getRemotePlayerById(id: number): PlayerData | undefined {
		return this.remotePlayers.find((player) => player.id === id);
	}

	public sendMessage(msg: string) {
		const chatMessage = {
			message: msg,
			id: this.localPlayer.id,
			name: this.getRemotePlayerData().find((player) => player.id === this.localPlayer.id)!.name,
		};
		if (msg.length < 1) return;
		if (chatMessage.message.startsWith('>')) chatMessage.message = '&2' + chatMessage.message;
		if (msg.charAt(0) === '/') {
			this.socket.emit('chatMsg', chatMessage);
			return;
		}
		chatMessage.message = '&f' + chatMessage.message;
		this.chatOverlay.addChatMessage(chatMessage);
		//this.chatOverlay.addEventMessage(chatMessage.message);
		this.socket.emit('chatMsg', chatMessage);
	}

	public applyDamage(id: number, damage: number, wasHeadshot: boolean) {
		if (this.localPlayer.playerSpectating !== -1) return;
		const player2 = this.remotePlayers.find((player) => player.id === id)!;
		const damageRequest = {
			localPlayer: this.localPlayer,
			targetPlayer: player2,
			damage: damage,
			wasHeadshot: wasHeadshot,
		};
		this.socket.emit('applyDamage', damageRequest);
		//	console.log(`Applying damage: ${id} - ${damage}`);
	}

	public shotGroupAdded() {
		this.socket.emit('shotGroupAdded', { id: this.localPlayer.id, heldItemIndex: this.localPlayer.heldItemIndex });
	}

	public getLocalPlayer() {
		return this.localPlayer;
	}

	public applyPropDamage(id: number, damage: number) {
		this.socket.emit('applyPropDamage', { playerID: this.localPlayer.id, targetPropID: id, damage: damage });

		console.log(`Applying prop damage: ${id} - ${damage}`);
	}

	public getWorldItemsData() {
		return this.worldItems;
	}
}
