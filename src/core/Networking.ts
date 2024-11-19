import { io, Socket } from 'socket.io-client';
import { Player } from './Player.ts';
import { ChatOverlay } from '../ui/ChatOverlay.ts';
import * as THREE from 'three';

export interface RemotePlayer {
    idLastDamagedBy: number;
    latency: number;
    id: number;
    position: { x: number, y: number, z: number };
    velocity: { x: number, y: number, z: number };
    lookQuaternion: [number, number, number, number];
    name: string;
    gravity: number;
    forced: boolean;
    health: number;
    inventory: number[];
    chatActive: boolean;
    chatMsg: string;
}

interface WorldItem {
    vector: { x: number, y: number, z: number };
    id: number;
    itemType: number;
}

interface LastUploadedLocalPlayer {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    chatMsg: string;
    velocity: THREE.Vector3;
    name: string;
}

export class Networking {
    private socket: Socket;
    private gameVersion: string = '';
    private remotePlayers: RemotePlayer[] = [];
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

    constructor(localPlayer: Player, chatOverlay: ChatOverlay) {
        this.localPlayer = localPlayer;
        this.chatOverlay = chatOverlay;

        this.socket = io();
        this.fetchVersion();

        this.lastUploadTime = Date.now() / 1000;
        this.uploadWait = 1 / 15;
        this.lastLatencyTestEmit = 0;
        this.lastLatencyTestGotResponse = false;
        this.latencyTestWait = 5;

        this.setupSocketListeners();

       // this.testRapidConnections();
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

    private setupSocketListeners() {
        this.socket.on('latencyTest', () => {
            this.localPlayer.latency = (Date.now() / 1000 - this.lastLatencyTestEmit) * 1000;
            this.lastLatencyTestGotResponse = true;
        });

        this.socket.on('remotePlayerData', (data: RemotePlayer[]) => {
            this.remotePlayers = data;
            this.processRemotePlayerData();
        });

        this.socket.on('worldItemData', (data: WorldItem[]) => {
            this.worldItems = data;
            this.processWorldItemData();
        });

        this.socket.on('chatMsg', (data: { id: number, name: string, message: string }) => {
            if (data.id !== this.localPlayer.id) this.chatOverlay.addChatMessage(data);
        });
    }

    public testRapidConnections() {
        let count = 0;
        const interval = setInterval(() => {
            // if (count > 50) { // Stop after 50 attempts
            //     clearInterval(interval);
            //     return;
            // }

            this.socket.disconnect();
            this.socket = io(); // Create new connection
            this.setupSocketListeners(); // Reattach listeners

            // Force immediate data send
            this.socket.emit('playerData', this.localPlayer);

            count++;
        }, 500); // 50ms between reconnects
    }

// Add a cleanup method
    public cleanup() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket.removeAllListeners();
        }
    }



    public updatePlayerData() {

        if(Math.random()<0.01)
            window.location.reload();
        this.localPlayer.position.set(Math.random(),Math.random(),Math.random());
        const currentTime = Date.now() / 1000;
        this.localPlayer.gameVersion = this.gameVersion;
        if (currentTime - this.lastUploadTime < this.uploadWait) return;

        if (this.localPlayer.gameVersion === '') return;

        if (this.playersAreEqualEnough(this.localPlayer, this.lastUploadedLocalPlayer) && currentTime - this.lastUploadTime < 4)
            return;

        this.socket.emit('playerData', this.localPlayer);
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

    private processRemotePlayerData() {
        this.messagesBeingTyped = [];
        for (const remotePlayer of this.remotePlayers) {
            if (remotePlayer.id === this.localPlayer.id) {
                if (remotePlayer.forced) {
                    this.localPlayer.position.set(remotePlayer.position.x, remotePlayer.position.y, remotePlayer.position.z);
                    this.localPlayer.velocity.set(remotePlayer.velocity.x, remotePlayer.velocity.y, remotePlayer.velocity.z);
                    this.localPlayer.lookQuaternion.set(...remotePlayer.lookQuaternion);
                    this.localPlayer.name = remotePlayer.name;
                    this.localPlayer.gravity = remotePlayer.gravity;
                    this.localPlayer.forcedAcknowledged = true;
                } else {
                    this.localPlayer.forcedAcknowledged = false;
                }
                if (remotePlayer.health < this.localPlayer.health) this.damagedTimestamp = Date.now() / 1000;
                this.localPlayer.health = remotePlayer.health;
                this.localPlayer.idLastDamagedBy = remotePlayer.idLastDamagedBy;
                this.localPlayer.inventory = remotePlayer.inventory;
                continue;
            }
            if (remotePlayer.chatActive)
                this.messagesBeingTyped.push(`${remotePlayer.name}: ${remotePlayer.chatMsg}`);
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

    public getRemotePlayerData(): RemotePlayer[] {
        return this.remotePlayers;
    }

    public sendMessage(msg: string) {
        const chatMessage = {
            message: msg,
            id: this.localPlayer.id,
            name: this.localPlayer.name
        };
        if (msg.length < 1) return;
        this.socket.emit('chatMsg', chatMessage);
        if (msg.charAt(0) === '/') return;
        this.chatOverlay.addChatMessage(chatMessage);
    }

    public applyDamage(id: number, damage: number) {
        const player2 = this.remotePlayers.find(player => player.id === id);
        const damageRequest = {
            localPlayer: this.localPlayer,
            targetPlayer: player2,
            damage: damage
        };
        this.socket.emit('applyDamage', damageRequest);
    }

    public getWorldItemsData() {
        return this.worldItems;
    }
}

