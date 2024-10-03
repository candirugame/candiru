import * as THREE from 'three';
import { Player } from './Player';
import { Renderer } from './Renderer';
import { Networking } from './Networking';
import {InputHandler} from "./InputHandler";

export class ChatOverlay {
    private chatScene: THREE.Scene;
    private chatCamera: THREE.PerspectiveCamera;
    private chatCanvas: HTMLCanvasElement;
    private chatCtx: CanvasRenderingContext2D;
    private chatMessages;//TODO: type this?
    private chatMessageLifespan: number;
    private charsToRemovePerSecond: number;
    private maxMessagesOnScreen: number;
    private nameSettingActive: boolean;
    private localPlayer: Player;
    private renderer: Renderer;
    private networking: Networking;
    private chatTexture: THREE.CanvasTexture;
    private chatPlane: THREE.Mesh;
    private screenWidth: number;
    private inputHandler : InputHandler;

    constructor(localPlayer: Player) {
        this.localPlayer = localPlayer;
        this.chatScene = new THREE.Scene();
        this.chatCamera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.01, 1000);
        this.chatCanvas = document.createElement('canvas');
        this.chatCtx = this.chatCanvas.getContext('2d');
        this.chatCtx.imageSmoothingEnabled = false;
        this.chatCanvas.width = 1024;
        this.chatCanvas.height = 200;

        this.chatMessages = [];
        this.chatMessageLifespan = 40; // 20 seconds
        this.charsToRemovePerSecond = 30;
        this.maxMessagesOnScreen = 12;

        this.nameSettingActive = false;
        this.screenWidth = 100;



        this.setupEventListeners();
        this.setupChatPlane();
    }

    public setRenderer(renderer: Renderer) {
        this.renderer = renderer;
    }

    public setNetworking(networking: Networking) {
        this.networking = networking;
    }
    public setInputHandler(inputHandler: InputHandler){
        this.inputHandler = inputHandler;
    }

    private setupEventListeners() {
        document.addEventListener('keydown', this.onKeyDown.bind(this));
    }

    private setupChatPlane() {
        const scaleFactor = 0.001;

        this.chatTexture = new THREE.CanvasTexture(this.chatCanvas);
        this.chatTexture.minFilter = THREE.NearestFilter;
        this.chatTexture.magFilter = THREE.NearestFilter;

        const chatGeometry = new THREE.PlaneGeometry(this.chatCanvas.width, this.chatCanvas.height);
        const chatMaterial = new THREE.MeshBasicMaterial({
            map: this.chatTexture,
            transparent: true
        });

        this.chatPlane = new THREE.Mesh(chatGeometry, chatMaterial);
        this.chatPlane.scale.set(scaleFactor, scaleFactor, scaleFactor);
        this.chatScene.add(this.chatPlane);
    }

    public onFrame() {
        this.clearOldMessages();
        this.chatCtx.clearRect(0, 0, this.chatCanvas.width, this.chatCanvas.height);
        this.renderChatMessages();
        this.renderDebugText();
        if(this.inputHandler.getKey('tab'))
            this.renderPlayerList();
        this.renderCrosshair();
        this.chatTexture.needsUpdate = true;

        const distanceFromCamera = 0.1;
        const frustumHeight = 2 * distanceFromCamera * Math.tan(THREE.MathUtils.degToRad(this.chatCamera.fov / 2));
        const frustumWidth = frustumHeight * this.chatCamera.aspect;
        const leftEdgeX = -frustumWidth / 2;

        const vector = new THREE.Vector3(leftEdgeX, 0, -distanceFromCamera);
        vector.applyMatrix4(this.chatCamera.matrixWorld);
        this.chatPlane.position.set(vector.x, vector.y, vector.z);
        this.chatPlane.quaternion.copy(this.chatCamera.quaternion);

        this.screenWidth = this.renderer.getCamera().aspect * 200;
    }

    private renderChatMessages() {
        const ctx = this.chatCtx;
        ctx.font = '8px Tiny5';
        ctx.fillStyle = 'white';

        const usermsg = this.localPlayer.chatMsg;
        let cursor = '';
        if ((Date.now() / 1000) % 0.7 < 0.35) cursor = '|';

        const linesToRender = [];
        const pixOffsets = [];

        if (this.localPlayer.chatActive) {
            linesToRender.push(usermsg + cursor);
            pixOffsets.push(0);
        }

        if (this.nameSettingActive) {
            linesToRender.push('Enter your name: ' + usermsg + cursor);
            pixOffsets.push(0);
        }

        const messagesBeingTyped = this.networking.getMessagesBeingTyped();
        for (const msg of messagesBeingTyped) {
            linesToRender.push(msg + cursor);
            pixOffsets.push(0);
        }

        for (let i = this.chatMessages.length - 1; i >= 0; i--) {
            let msg = this.chatMessages[i]['message'];
            const name = this.chatMessages[i]['name'];
            if (name.length > 0) msg = name + ': ' + msg;

            let duplicateFromPlayerData = false;
            for (const message of messagesBeingTyped)
                if (message === msg) duplicateFromPlayerData = true;

            let charsToRemove = Date.now() / 1000 - this.chatMessages[i]['timestamp'] - this.chatMessageLifespan;
            if (charsToRemove < 0) charsToRemove = 0;
            charsToRemove *= this.charsToRemovePerSecond;
            charsToRemove = Math.floor(charsToRemove);

            const removedSubstring = msg.substring(0, charsToRemove);
            msg = msg.substring(charsToRemove);

            if (!duplicateFromPlayerData) {
                linesToRender.push(msg);
                pixOffsets.push(ctx.measureText(removedSubstring).width);
            }
        }

        for (let i = 0; i < linesToRender.length; i++)
            ctx.fillText(linesToRender[i], this.chatCanvas.width / 2 + 3 + pixOffsets[i], 200 - 40 - 8 * i);

        if ((usermsg !== '' && this.localPlayer.chatActive) || this.nameSettingActive) {
            ctx.fillStyle = 'rgba(145,142,118,0.3)';
            let width = ctx.measureText(usermsg).width;
            if (this.nameSettingActive)
                width = ctx.measureText('Enter your name: ' + usermsg).width;
            ctx.fillRect(this.chatCanvas.width / 2 + 2, 200 - 40 - 7, width + 1, 9);
        }
    }

    private renderDebugText() {
        const ctx = this.chatCtx;
        ctx.font = '8px Tiny5';
        ctx.fillStyle = 'teal';

        const linesToRender = [];
        const framerate = this.renderer.getFramerate();
        //const latency = this.localPlayer.latency;
        // const health = this.localPlayer.health;
         //const playerX = Math.floor(this.localPlayer.position.x * 100)/100;
         //const playerY = Math.floor(this.localPlayer.position.y * 100)/100;
         //const playerZ = Math.floor(this.localPlayer.position.z * 100)/100;

        //const playerVelX = Math.floor(this.localPlayer.velocity.x * 100)/100;
        //const playerVelY = Math.floor(this.localPlayer.velocity.y * 100)/100;
        //const playerVelZ = Math.floor(this.localPlayer.velocity.z * 100)/100;


        if(this.localPlayer.latency >=999)
            linesToRender.push('Disconnected :(');

        linesToRender.push(Math.floor(framerate) + 'FPS');
        //linesToRender.push(Math.floor(latency) + 'ms');
        //linesToRender.push('health: ' + health);
        //linesToRender.push('x: ' + playerX + ' y: ' + playerY + ' z: ' + playerZ);
        //linesToRender.push('vx: ' + playerVelX + ' vy: ' + playerVelY + ' vz: ' + playerVelZ);

        for (let i = 0; i < linesToRender.length; i++)
            ctx.fillText(linesToRender[i], this.chatCanvas.width / 2 + 2, 7 + 7 * i);
    }

    private renderPlayerList(){
        const ctx = this.chatCtx;
        const linesToRender:string[] = [];
        const colorsToRender = [];
        const playerData = this.networking.getRemotePlayerData();

        linesToRender.push(playerData.length + ' online - ' + Math.round(this.localPlayer.latency) + 'ms');
        colorsToRender.push('white');
        for(let i = 0; i < playerData.length; i++){
            linesToRender.push(playerData[i].name + ' - ' + playerData[i].health);
            if(playerData[i].latency > 200)
                colorsToRender.push('red');
            else if(playerData[i].latency > 50)
                colorsToRender.push('orange');
            else
                colorsToRender.push('green');
        }

        ctx.font = '8px Tiny5';

        let longestLinePix = 0;
        for (let i = 0; i < linesToRender.length; i++)
            longestLinePix = Math.max(longestLinePix, ctx.measureText(linesToRender[i]).width);


        //rectangular background at top center
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(Math.floor(this.chatCanvas.width / 2 + this.screenWidth / 2 - longestLinePix/2), 4, longestLinePix+3, linesToRender.length * 7 + 2);

        for (let i = 0; i < linesToRender.length; i++){
            ctx.fillStyle = colorsToRender[i];
            ctx.fillText(linesToRender[i], Math.floor(this.chatCanvas.width / 2 + this.screenWidth / 2 - longestLinePix/2 +2), 11 + 7 * i);
        }


    }

    private renderCrosshair() {
        const ctx = this.chatCtx;
        ctx.fillStyle = 'rgb(0,255,225)';
        if(this.renderer.crosshairIsFlashing)
            ctx.fillStyle = 'rgb(255,0,0)';
        ctx.fillRect(this.chatCanvas.width / 2 + this.screenWidth / 2, 100 - 3, 1, 7);
        ctx.fillRect(this.chatCanvas.width / 2 + this.screenWidth / 2 - 3, 100, 7, 1);
    }

    private onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Backspace' && (this.localPlayer.chatActive || this.nameSettingActive)) {
            this.localPlayer.chatMsg = this.localPlayer.chatMsg.slice(0, -1);
            return;
        }

        if (e.key === 'Enter') {
            if (this.localPlayer.chatActive) this.networking.sendMessage(this.localPlayer.chatMsg);
            if (this.nameSettingActive) {
                this.localPlayer.name = this.localPlayer.chatMsg.toString();
                localStorage.setItem('name', this.localPlayer.name);
            }
            this.localPlayer.chatMsg = '';
            this.localPlayer.chatActive = false;
            this.nameSettingActive = false;
        }

        if (e.key === 'Escape' || e.key === 'Enter') {
            this.localPlayer.chatMsg = '';
            this.localPlayer.chatActive = false;
            this.nameSettingActive = false;
        }

        if ((this.localPlayer.chatActive || this.nameSettingActive) && e.key.length === 1)
            this.localPlayer.chatMsg += e.key;

        if (e.key.toLowerCase() === 't' && !this.nameSettingActive) {
            if (this.localPlayer.name.length > 0) this.localPlayer.chatActive = true;
            else this.nameSettingActive = true;
        }

        if (e.key === '/' && !this.nameSettingActive && !this.localPlayer.chatActive) {
            if (this.localPlayer.name.length > 0) {
                this.localPlayer.chatActive = true;
                this.localPlayer.chatMsg = '/';
            } else {
                this.nameSettingActive = true;
            }
        }

        if (e.key.toLowerCase() === 'n' && !this.localPlayer.chatActive)
            this.nameSettingActive = true;
    }

    public addChatMessage(msg) {//TODO: type this?
        msg['timestamp'] = Date.now() / 1000;
        this.chatMessages.push(msg);
    }

    public getChatScene() {
        return this.chatScene;
    }

    public getChatCamera() {
        return this.chatCamera;
    }

    private clearOldMessages() {
        for (let i = 0; i < this.chatMessages.length; i++)
            if (Date.now() / 1000 - this.chatMessages[i]['timestamp'] > this.chatMessageLifespan + 5)
                this.chatMessages.splice(i, 1);

        for (let i = this.chatMessages.length - 1; i >= 0; i--) {
            if (i < this.chatMessages.length - this.maxMessagesOnScreen)
                this.chatMessages[i]['timestamp'] = Math.min(
                    Date.now() / 1000 - this.chatMessageLifespan,
                    this.chatMessages[i]['timestamp']
                );
        }
    }
}