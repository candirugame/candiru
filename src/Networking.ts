import { io, Socket } from 'socket.io-client';
import { Player } from './Player';
import { ChatOverlay } from './ChatOverlay';
import * as THREE from 'three';

export class Networking {
    private socket: Socket;
    private gameVersion: string;
    private remotePlayers;
    private lastUploadedLocalPlayer;
    private lastUploadTime: number;
    private uploadWait: number;
    private lastLatencyTestEmit: number;
    private lastLatencyTestGotResponse: boolean;
    private latencyTestWait: number;
    private messagesBeingTyped: string[];
    private localPlayer: Player;
    private chatOverlay: ChatOverlay;

    constructor(localPlayer: Player, chatOverlay: ChatOverlay) {
        this.localPlayer = localPlayer;
        this.chatOverlay = chatOverlay;

        this.socket = io();
        this.fetchVersion();

        this.remotePlayers = [];
        this.lastUploadedLocalPlayer = null;

        this.lastUploadTime = Date.now()/1000;
        this.uploadWait = 1 / 15;
        this.lastLatencyTestEmit = 0;
        this.lastLatencyTestGotResponse = false;
        this.latencyTestWait = 5;
        this.messagesBeingTyped = [];

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

    private setupSocketListeners() {
        this.socket.on('latencyTest', () => {
            this.localPlayer.latency = (Date.now() / 1000 - this.lastLatencyTestEmit) * 1000;
            this.lastLatencyTestGotResponse = true;
        });

        this.socket.on('remotePlayerData', (data) => {
            this.remotePlayers = data;
            this.processRemoteData();
        });

        this.socket.on('chatMsg', (data) => {
            if (data.id !== this.localPlayer.id) this.chatOverlay.addChatMessage(data);
        });
    }

    public updatePlayerData() {
        const currentTime = Date.now() / 1000;
        this.localPlayer.gameVersion = this.gameVersion;
        if (currentTime - this.lastUploadTime < this.uploadWait) return;

        if (this.localPlayer.gameVersion === '') return;

        if (this.playersAreEqualEnough(this.localPlayer, this.lastUploadedLocalPlayer) && currentTime - this.lastUploadTime < 5)
            return;

        this.socket.emit('playerData', this.localPlayer);
        this.lastUploadedLocalPlayer = {
            position: this.localPlayer.position.clone(),
            quaternion: this.localPlayer.quaternion.clone(),
            chatMsg: this.localPlayer.chatMsg
        };

        this.lastUploadTime = currentTime;

        if (currentTime - this.lastLatencyTestEmit > this.latencyTestWait) {
            this.socket.emit('latencyTest');
            this.lastLatencyTestEmit = currentTime;
            if(!this.lastLatencyTestGotResponse){
                this.localPlayer.latency = 999;
            }
            this.lastLatencyTestGotResponse = false;
        }
    }

    private processRemoteData() {
        this.messagesBeingTyped = [];
        for (const remotePlayer of this.remotePlayers) {
            if (remotePlayer['id'] === this.localPlayer.id) {
                if(remotePlayer['forced'] === true){
                    this.localPlayer.position = new THREE.Vector3(remotePlayer['position']['x'], remotePlayer['position']['y'], remotePlayer['position']['z']);
                    this.localPlayer.quaternion = new THREE.Quaternion(remotePlayer['quaternion'][0], remotePlayer['quaternion'][1], remotePlayer['quaternion'][2], remotePlayer['quaternion'][3]);
                    this.localPlayer.name = remotePlayer['name'];
                    this.localPlayer.forcedAcknowledged = true;
                }else{
                    this.localPlayer.forcedAcknowledged = false;
                }

                this.localPlayer.health = remotePlayer['health']; //trust server to handle health
                continue;
            }
            if (remotePlayer['chatActive'])
                this.messagesBeingTyped.push(remotePlayer['name'] + ': ' + remotePlayer['chatMsg']);
        }
    }

    public getMessagesBeingTyped() {
        return this.messagesBeingTyped;
    }

    private playersAreEqualEnough(player1: Player, player2: Player) {
        if (player1 === null || player2 === null) return false;
        let out = true;
        out = out && player1.position.equals(player2.position);
        out = out && player1.quaternion.equals(player2.quaternion);
        out = out && player1.chatMsg === player2.chatMsg;

        return out;
    }

    public getRemotePlayerData() {
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

    public applyDamage(id:number, damage: number) {
        const player2 = this.remotePlayers.find((player) => player.id === id);
        const damageRequest = {
            localPlayer: this.localPlayer,
            targetPlayer: player2,
            damage: damage
        };
        this.socket.emit('applyDamage',damageRequest);
    }
}