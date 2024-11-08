import { Player } from '../core/Player.ts';
import { Renderer } from '../core/Renderer.ts';
import { Networking } from '../core/Networking.ts';
import { InputHandler } from '../input/InputHandler.ts';
import {CommandManager} from "../core/CommandManager.ts";
import {SettingsManager} from "../core/SettingsManager.ts";
import * as THREE from 'three';


interface ChatMessage {
    id: number;
    message: string;
    name: string;
    timestamp: number;
}

const hitMarkerLifetime = 0.2;

export class ChatOverlay {
    private chatCanvas: HTMLCanvasElement;
    private chatCtx: CanvasRenderingContext2D;
    private chatMessages: ChatMessage[]; // Typed as ChatMessage[]
    private chatMessageLifespan: number;
    private charsToRemovePerSecond: number;
    private maxMessagesOnScreen: number;
    private nameSettingActive: boolean;
    private localPlayer: Player;
    private renderer!: Renderer;
    private networking!: Networking;
    private screenWidth: number;
    private inputHandler!: InputHandler;
    private debugTextHeight!: number;
    private oldScreenWidth:number = 0;
    private readonly commandManager: CommandManager;

    constructor(localPlayer: Player) {
        this.localPlayer = localPlayer;
        this.chatCanvas = document.createElement('canvas');
        this.chatCtx = this.chatCanvas.getContext('2d') as CanvasRenderingContext2D;
        this.chatCtx.imageSmoothingEnabled = false;


        this.chatCanvas.width = 400;
        this.chatCanvas.height = 200;

        this.chatMessages = [];
        this.chatMessageLifespan = 40; // 20 seconds
        this.charsToRemovePerSecond = 30;
        this.maxMessagesOnScreen = 12;

        this.nameSettingActive = false;
        this.screenWidth = 100;

        this.commandManager = new CommandManager(this.localPlayer, this);

        this.setupEventListeners();

        this.chatCanvas.style.position = 'absolute';
        this.chatCanvas.style.top = '0';
        this.chatCanvas.style.left = '0';

         this.chatCanvas.style.height = '100vh';
        document.body.style.margin = '0';
        this.chatCanvas.style.imageRendering = 'pixelated';
        document.body.appendChild(this.chatCanvas);
    }

    public setRenderer(renderer: Renderer) {
        this.renderer = renderer;
    }

    public setNetworking(networking: Networking) {
        this.networking = networking;
    }

    public setInputHandler(inputHandler: InputHandler) {
        this.inputHandler = inputHandler;
    }

    private setupEventListeners() {
        document.addEventListener('keydown', this.onKeyDown.bind(this));
    }



    public onFrame() {
        this.clearOldMessages();
        this.chatCtx.clearRect(0, 0, this.chatCanvas.width, this.chatCanvas.height);
        this.renderHitMarkers();
        this.renderChatMessages();
        this.renderDebugText();
        if (this.inputHandler.getKey('tab'))
            this.renderPlayerList();
        this.renderEvil();
        this.renderCrosshair();


        this.screenWidth = Math.floor(this.renderer.getCamera().aspect * 200);

        if(this.oldScreenWidth !== this.screenWidth){
            if(this.chatCanvas.width < this.screenWidth)
                this.chatCanvas.width = this.screenWidth;
            this.oldScreenWidth = this.screenWidth;
        }


        // this.chatCanvas.width = this.screenWidth;
        // this.chatCtx.fillRect(0,0,10,10);



    }

    private renderChatMessages() {
        const ctx = this.chatCtx;
        ctx.font = '8px Tiny5';
        ctx.fillStyle = 'white';

        const usermsg = this.localPlayer.chatMsg;
        let cursor = '';
        if ((Date.now() / 1000) % 0.7 < 0.35) cursor = '|';

        const linesToRender: string[] = [];
        const pixOffsets: number[] = [];
        const messagesBeingTyped = this.networking.getMessagesBeingTyped();

        for (let i = 0; i < this.chatMessages.length; i++) {
            let msg = this.chatMessages[i].message;
            const name = this.chatMessages[i].name;
            if (name.length > 0) msg = `${name}: ${msg}`;

            const duplicateFromPlayerData = messagesBeingTyped.includes(msg);

            let charsToRemove = Date.now() / 1000 - this.chatMessages[i].timestamp - this.chatMessageLifespan;
            charsToRemove = Math.max(0, charsToRemove * this.charsToRemovePerSecond);
            charsToRemove = Math.floor(charsToRemove);

            let removedSubstring = '';
            let remainingMsg = msg;
            if (charsToRemove > 0) {
                let charsRemoved = 0;
                while (charsRemoved < charsToRemove && remainingMsg.length > 0) {
                    const char = remainingMsg.charAt(0);
                    removedSubstring += char;
                    remainingMsg = remainingMsg.substring(1);
                    charsRemoved++;
                }
            }

            if (!duplicateFromPlayerData) {
                linesToRender.push(remainingMsg);
                pixOffsets.push(ctx.measureText(removedSubstring).width);
            }
        }

        for (const msg of messagesBeingTyped) {
            linesToRender.push(msg + cursor);
            pixOffsets.push(0);
        }

        if (this.localPlayer.chatActive) {
            linesToRender.push(usermsg + cursor);
            pixOffsets.push(0);
        }

        if (this.nameSettingActive) {
            linesToRender.push('Enter your name: ' + usermsg + cursor);
            pixOffsets.push(0);
        }

        const wrappedLines: string[] = [];
        const lineOrigins: number[] = [];
        const isFirstWrappedLine: boolean[] = [];

        for (let i = 0; i < linesToRender.length; i++) {
            const wrapped = this.doTextWrapping(ctx, [linesToRender[i]], this.screenWidth - 10);
            for (let j = 0; j < wrapped.length; j++) {
                wrappedLines.push(wrapped[j]);
                lineOrigins.push(i);
                isFirstWrappedLine.push(j === 0);
            }
        }

        const totalLines = wrappedLines.length;
        for (let i = 0; i < totalLines; i++) {
            const lineIndex = totalLines - i - 1;
            const text = wrappedLines[lineIndex];
            const originIndex = lineOrigins[lineIndex];
            const pixOffset = isFirstWrappedLine[lineIndex] ? pixOffsets[originIndex] : 0;

            ctx.fillText(text, 3 + pixOffset, 200 - 20 - 8 * i);
        }

        if ((usermsg !== '' && this.localPlayer.chatActive) || this.nameSettingActive) {
            ctx.fillStyle = 'rgba(145,142,118,0.3)';
            let width = ctx.measureText(usermsg).width;
            if (this.nameSettingActive) {
                width = ctx.measureText('Enter your name: ' + usermsg).width;
            }
            ctx.fillRect( 2, 200 - 20 - 7, width + 1, 9);
        }
    }

    private renderDebugText() {
        const ctx = this.chatCtx;
        ctx.font = '8px Tiny5';
        ctx.fillStyle = 'teal';

        const linesToRender = [];
        const framerate = this.renderer.getFramerate();
        const playerX = Math.floor(this.localPlayer.position.x * 100) / 100;
        const playerY = Math.floor(this.localPlayer.position.y * 100) / 100;
        const playerZ = Math.floor(this.localPlayer.position.z * 100) / 100;

        //const playerQuatX = Math.floor(this.localPlayer.lookQuaternion.x * 100) / 100;
        //const playerQuatY = Math.floor(this.localPlayer.lookQuaternion.y * 100) / 100;
        //const playerQuatZ = Math.floor(this.localPlayer.lookQuaternion.z * 100) / 100;
        //const playerQuatW = Math.floor(this.localPlayer.lookQuaternion.w * 100) / 100;

        // const playerVelX = Math.ceil(this.localPlayer.velocity.x * 100)/100;
        // const playerVelY = Math.ceil(this.localPlayer.velocity.y * 100)/100;
        // const playerVelZ = Math.ceil(this.localPlayer.velocity.z * 100)/100;


        const zero = new THREE.Vector3(0,0,0);
        const projected = zero.project(this.renderer.getCamera());
        const projectedX = Math.round((projected.x + 1) * this.screenWidth / 2);
        const projectedY = Math.round((-projected.y + 1) * 200 / 2);
        //linesToRender.push(this.renderer.);


        if(projected.z <1){
            ctx.fillRect(projectedX, projectedY-5, 1, 11);
            ctx.fillRect(projectedX - 5, projectedY, 11, 1);
        }



        if(this.localPlayer.latency >=999)
            linesToRender.push('Disconnected :(');

        linesToRender.push('Candiru ' + this.localPlayer.gameVersion + ' @ ' + Math.round(framerate) + 'FPS');
        //linesToRender.push(Math.floor(framerate) + 'FPS');
        linesToRender.push('x: ' + playerX + ' y: ' + playerY + ' z: ' + playerZ);
        //linesToRender.push('px: ' + projectedX + ' py: ' + projectedY + ' pz: ' + projected.z);
        //linesToRender.push('qx: ' + playerQuatX + ' qy: ' + playerQuatY + ' qz: ' + playerQuatZ + ' qw: ' + playerQuatW);
        // linesToRender.push('vx: ' + playerVelX + ' vy: ' + playerVelY + ' vz: ' + playerVelZ);

        for (let i = 0; i < linesToRender.length; i++) {
            ctx.fillText(linesToRender[i], 2, 7 + 7 * i);
        }

        this.debugTextHeight = 7 * linesToRender.length;
    }

    public renderHitMarkers() {
        for(let i = this.renderer.playerHitMarkers.length - 1; i >= 0; i--) {
            if(this.renderer.playerHitMarkers[i].timestamp === -1)
                this.renderer.playerHitMarkers[i].timestamp = Date.now() / 1000; //have timestamp be set in chatOverlay
            const timeSinceHit = Date.now() / 1000 - this.renderer.playerHitMarkers[i].timestamp;
            const lifePercent = timeSinceHit / hitMarkerLifetime;
            if(timeSinceHit > hitMarkerLifetime){
                this.renderer.playerHitMarkers.splice(i, 1);
                continue;
            }
            const hitVec = this.renderer.playerHitMarkers[i].hitPoint;
            const projected = hitVec.clone().project(this.renderer.getCamera());
            const projectedX = Math.round((projected.x + 1) * this.screenWidth / 2);
            const projectedY = Math.round((-projected.y + 1) * 200 / 2);

            if(projected.z < 1){
                this.chatCtx.fillStyle = 'rgba(255,0,0,1)';
                this.chatCtx.strokeStyle = 'rgba(255,0,0,'+ (1 - Math.pow(lifePercent,1.25))+')';
                //this.chatCtx.fillRect(projectedX - 1, projectedY - 1, 3, 3);
                this.chatCtx.beginPath();
                const sizeMultiplier = 1 + 2/this.renderer.playerHitMarkers[i].shotVector.length();
                this.chatCtx.arc(projectedX - 1, projectedY - 1, Math.pow(lifePercent,0.7)*6 * sizeMultiplier, 0, Math.PI * 2);
                this.chatCtx.stroke();
            }



        }
    }

    public getDebugTextHeight(): number {
        return this.debugTextHeight;
    }

    private renderPlayerList() {
        const ctx = this.chatCtx;
        const linesToRender: string[] = [];
        const colorsToRender: string[] = [];
        const playerData = this.networking.getRemotePlayerData();

        linesToRender.push(playerData.length + ' online - ' + Math.round(this.localPlayer.latency) + 'ms');
        colorsToRender.push('white');
        for (let i = 0; i < playerData.length; i++) {
            linesToRender.push(playerData[i].name);
            if (playerData[i].latency > 200)
                colorsToRender.push('red');
            else if (playerData[i].latency > 50)
                colorsToRender.push('orange');
            else
                colorsToRender.push('green');
        }

        ctx.font = '8px Tiny5';

        let longestLinePix = 0;
        for (let i = 0; i < linesToRender.length; i++)
            longestLinePix = Math.max(longestLinePix, ctx.measureText(linesToRender[i]).width);

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(Math.floor(this.screenWidth / 2 - longestLinePix / 2), 4, longestLinePix + 3, linesToRender.length * 7 + 2);

        for (let i = 0; i < linesToRender.length; i++) {
            ctx.fillStyle = colorsToRender[i];
            ctx.fillText(linesToRender[i], Math.floor(this.screenWidth / 2 - longestLinePix / 2 + 2), 11 + 7 * i);
        }
    }

    private renderEvil() {
        const ctx = this.chatCtx;
        if (Date.now() / 1000 - this.networking.getDamagedTimestamp() < 0.05) {
            ctx.fillStyle = 'rgba(255,0,0,0.1)';
            ctx.fillRect(0, 0, this.chatCanvas.width, this.chatCanvas.height);
        }
    }

    private renderCrosshair() {
        const ctx = this.chatCtx;
        ctx.fillStyle = 'rgb(0,255,225)';
        if (this.renderer.crosshairIsFlashing)
            ctx.fillStyle = 'rgb(255,0,0)';
        ctx.fillRect(Math.floor(this.screenWidth / 2), 100 - 3, 1, 7);
        ctx.fillRect(Math.floor(this.screenWidth / 2 - 3), 100, 7, 1);
    }

    private onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Backspace' && (this.localPlayer.chatActive || this.nameSettingActive)) {
            this.localPlayer.chatMsg = this.localPlayer.chatMsg.slice(0, -1);
            return;
        }

        if (e.key === 'Enter') {
            if (this.localPlayer.chatActive) {
                if(!this.commandManager.runCmd(this.localPlayer.chatMsg)) this.networking.sendMessage(this.localPlayer.chatMsg);
            }
            if (this.nameSettingActive) {
                this.localPlayer.name = this.localPlayer.chatMsg.toString();
                SettingsManager.settings.name = this.localPlayer.chatMsg.toString();
                SettingsManager.write();
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

        if ((this.localPlayer.chatActive) && e.key.length === 1 && this.localPlayer.chatMsg.length < 300)
            this.localPlayer.chatMsg += e.key;

        if ((this.nameSettingActive) && e.key.length === 1 && this.localPlayer.chatMsg.length < 42)
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

    public addChatMessage(msg: { id: number; name: string; message: string; }) {
        const chatMessage: ChatMessage = {
            id: msg.id,
            name: msg.name,
            message: msg.message,
            timestamp: Date.now() / 1000,
        };
        this.chatMessages.push(chatMessage);
    }

    private clearOldMessages() {
        for (let i = 0; i < this.chatMessages.length; i++)
            if (Date.now() / 1000 - this.chatMessages[i].timestamp > this.chatMessageLifespan + 5)
                this.chatMessages.splice(i, 1);

        for (let i = this.chatMessages.length - 1; i >= 0; i--) {
            if (i < this.chatMessages.length - this.maxMessagesOnScreen)
                this.chatMessages[i].timestamp = Math.min(Date.now() / 1000 - this.chatMessageLifespan, this.chatMessages[i].timestamp);
        }
    }

    private doTextWrapping(ctx: CanvasRenderingContext2D, text: string[], maxWidth: number, initialOffset: number = 0): string[] {
        ctx.font = '8px Tiny5';
        const resultLines: string[] = [];

        for (const line of text) {
            if (line === '' || ctx.measureText(line).width <= maxWidth) {
                resultLines.push(line);
                continue;
            }

            const words = line.split(' ');
            let currentLine = '';
            let isFirstLine = true;

            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const testWidth = ctx.measureText(testLine).width;

                const availableWidth = isFirstLine ? maxWidth - initialOffset : maxWidth;

                if (testWidth <= availableWidth) {
                    currentLine = testLine;
                } else {
                    if (currentLine) {
                        resultLines.push(currentLine);
                    }
                    currentLine = word;
                    isFirstLine = false;
                }
            }

            if (currentLine) {
                resultLines.push(currentLine);
            }
        }

        return resultLines;
    }


}