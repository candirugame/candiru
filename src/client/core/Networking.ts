import * as THREE from 'three';
import { io } from 'socket.io-client';
import { ChatOverlay } from '../ui/ChatOverlay.ts';
import { CustomClientSocket } from '../../shared/messages.ts';
import { Player, PlayerData } from '../../shared/Player.ts';

interface WorldItem {
	vector: { x: number; y: number; z: number };
	id: number;
	itemType: number;
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
	memUsage: number;
	idleKickTime: number;
}

interface LastUploadedLocalPlayer {
	position: THREE.Vector3;
	quaternion: THREE.Quaternion;
	chatMsg: string;
	velocity: THREE.Vector3;
	name: string;
}

export class Networking {
	private socket: CustomClientSocket;
	private gameVersion: string = '';
	private remotePlayers: PlayerData[] = [];
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
			playerMaxHealth: 0,
			skyColor: '#000000',
			tickComputeTime: 0,
			cleanupComputeTime: 0,
			url: '',
			memUsage: 0,
			idleKickTime: 60,
		};

		this.setupSocketListeners();
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

	public fetchServerList(callback: (servers: Array<{ url: string; info: ServerInfo }>) => void) {
		this.socket.emit('getServerList', callback);
	}

	private setupSocketListeners() {
		this.socket.on('latencyTest', () => {
			this.localPlayer.latency = (Date.now() / 1000 - this.lastLatencyTestEmit) * 1000;
			this.lastLatencyTestGotResponse = true;
		});

		this.socket.on('remotePlayerData', (data) => {
			this.remotePlayers = data;
			this.processRemotePlayerData();
		});

		this.socket.on('worldItemData', (data) => {
			this.worldItems = data;
			this.processWorldItemData();
		});

		this.socket.on('chatMsg', (data) => {
			if (data.id !== this.localPlayer.id) this.chatOverlay.addChatMessage(data);
		});

		this.socket.on('serverInfo', (data) => {
			this.serverInfo = {
				...data,
			};
			this.onServerInfo();
		});

		this.socket.on('particleEmit', (data) => {
			const particleData = {
				position: new THREE.Vector3(data.position.x, data.position.y, data.position.z),
				velocity: new THREE.Vector3(data.velocity.x, data.velocity.y, data.velocity.z),
				count: data.count,
				spread: data.spread,
				lifetime: data.lifetime,
				size: data.size,
				color: new THREE.Color(data.color),
			};

			this.particleQueue.push(particleData);
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

		if (currentTime - this.lastRealUpdateTime > this.serverInfo.idleKickTime) { //disconnect on idle
			if (!this.remotePlayers.some((player) => player.id === this.localPlayer.id)) {
				this.localPlayer.gameMsgs = ['&cdisconnected for being idle', '&cmove to reconnect'];
			}
			return;
		}

		if (equalToLastUpload && currentTime - this.lastUploadTime < 4) return;

		this.socket.volatile.emit('playerData', this.localPlayer);
		this.lastUploadedLocalPlayer = {
			position: this.localPlayer.position.clone(),
			quaternion: this.localPlayer.quaternion.clone(),
			chatMsg: this.localPlayer.chatMsg,
			velocity: this.localPlayer.velocity.clone(),
			name: this.localPlayer.name,
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

	private processRemotePlayerData() {
		this.messagesBeingTyped = [];
		for (const remotePlayer of this.remotePlayers) {
			if (remotePlayer.id === this.localPlayer.id) {
				if (remotePlayer.forced) {
					this.localPlayer.position.set(remotePlayer.position.x, remotePlayer.position.y, remotePlayer.position.z);
					this.localPlayer.velocity.set(remotePlayer.velocity.x, remotePlayer.velocity.y, remotePlayer.velocity.z);
					this.localPlayer.lookQuaternion.set(
						remotePlayer.lookQuaternion.x,
						remotePlayer.lookQuaternion.y,
						remotePlayer.lookQuaternion.z,
						remotePlayer.lookQuaternion.w,
					);
					//this.localPlayer.name = remotePlayer.name;
					this.localPlayer.gravity = remotePlayer.gravity;
					this.localPlayer.forcedAcknowledged = true;
				} else {
					this.localPlayer.forcedAcknowledged = false;
				}
				if (remotePlayer.health < this.localPlayer.health) this.damagedTimestamp = Date.now() / 1000;
				this.localPlayer.health = remotePlayer.health;
				this.localPlayer.highlightedVectors = remotePlayer.highlightedVectors.map(
					(vec) => new THREE.Vector3(vec.x, vec.y, vec.z),
				);
				this.localPlayer.directionIndicatorVector = remotePlayer.directionIndicatorVector
					? new THREE.Vector3(
						remotePlayer.directionIndicatorVector.x,
						remotePlayer.directionIndicatorVector.y,
						remotePlayer.directionIndicatorVector.z,
					)
					: undefined;

				this.localPlayer.idLastDamagedBy = remotePlayer.idLastDamagedBy;
				this.localPlayer.inventory = remotePlayer.inventory;
				this.localPlayer.playerSpectating = remotePlayer.playerSpectating;
				this.localPlayer.gameMsgs = remotePlayer.gameMsgs;
				this.localPlayer.gameMsgs2 = remotePlayer.gameMsgs2;
				this.localPlayer.doPhysics = remotePlayer.doPhysics;
				continue;
			}
			if (remotePlayer.chatActive) {
				this.messagesBeingTyped.push(`${remotePlayer.name}: ${remotePlayer.chatMsg}`);
			}
		}
		if (
			this.getServerInfo().maxPlayers <= this.getServerInfo().currentPlayers &&
			this.getServerInfo().currentPlayers !== 0 &&
			!this.remotePlayers.some((player) => player.id === this.localPlayer.id)
		) {
			this.localPlayer.gameMsgs = [
				`&cThe server is full. (${this.getServerInfo().currentPlayers + '/' + this.getServerInfo().maxPlayers}) `,
				`&cYou'll automatically connect when a spot opens up. `,
			];
		}
		if (
			this.getServerInfo().version && this.localPlayer.gameVersion !== this.getServerInfo().version
		) {
			this.localPlayer.gameMsgs = ['&cYour client may be outdated. Try refreshing the page.'];
		}
	}

	private playersAreEqualEnough(player1: Player, player2: LastUploadedLocalPlayer | null) {
		if (player1 === null || player2 === null) return false;
		let out = true;
		out = out && player1.position.equals(player2.position);
		out = out && player1.quaternion.equals(player2.quaternion);
		out = out && player1.chatMsg === player2.chatMsg;
		out = out && player1.velocity.equals(player2.velocity);
		out = out && player1.name === player2.name;

		return out;
	}

	public getDamagedTimestamp() {
		return this.damagedTimestamp;
	}

	public getMessagesBeingTyped() {
		return this.messagesBeingTyped;
	}

	public getRemotePlayerData(): PlayerData[] {
		return this.remotePlayers;
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
		this.socket.emit('chatMsg', chatMessage);
	}

	public applyDamage(id: number, damage: number) {
		if (this.localPlayer.playerSpectating !== -1) return;
		const player2 = this.remotePlayers.find((player) => player.id === id)!;
		const damageRequest = {
			localPlayer: this.localPlayer,
			targetPlayer: player2,
			damage: damage,
		};
		this.socket.emit('applyDamage', damageRequest);
	}

	public getWorldItemsData() {
		return this.worldItems;
	}
}
