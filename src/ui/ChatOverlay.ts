import {Player} from '../core/Player.ts';
import {Renderer} from '../core/Renderer.ts';
import {Networking} from '../core/Networking.ts';
import {InputHandler} from '../input/InputHandler.ts';
import {CommandManager} from "../core/CommandManager.ts";
import {SettingsManager} from "../core/SettingsManager.ts";
import {TouchInputHandler} from "../input/TouchInputHandler.ts";

interface ChatMessage {
    id: number;
    message: string;
    name: string;
    timestamp: number;
}

const hitMarkerLifetime = 0.3;

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
    private lastTouchTimestamp: number = 0;
    private touchJoystickEngaged: boolean = false;
    private joystickX: number = 0;
    private joystickY: number = 0;
    private joystickInputX: number = 0;
    private joystickInputY: number = 0;
    private buttonsHeld: number[] = [];
    private lastRoutineMs = 0;

    private offscreenCanvas: HTMLCanvasElement;
    private offscreenCtx: CanvasRenderingContext2D;

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
        this.chatCanvas.style.display = 'block';
        this.chatCanvas.style.zIndex = '100';
        this.chatCanvas.style.top = '0';
        this.chatCanvas.style.left = '0';

         this.chatCanvas.style.height = '100vh';
        document.body.style.margin = '0';
        this.chatCanvas.style.imageRendering = 'pixelated';
        this.chatCanvas.style.textRendering = 'pixelated';

        this.chatCanvas.style.touchAction = 'none';

        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d') as CanvasRenderingContext2D;

        document.body.appendChild(this.chatCanvas);

        globalThis.addEventListener('resize', this.onWindowResize.bind(this));
        globalThis.addEventListener('orientationchange', this.onWindowResize.bind(this));



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
        const startTime = Date.now();
        this.clearOldMessages();
        this.chatCtx.clearRect(0, 0, this.chatCanvas.width, this.chatCanvas.height);
        this.renderHitMarkers();
        this.renderChatMessages();
        this.renderDebugText();
        if (this.inputHandler.getKey('tab'))
            this.renderPlayerList();
        this.renderEvil();
        this.renderCrosshair();
        this.renderTouchControls();



        this.screenWidth = Math.floor(this.renderer.getCamera().aspect * 200);

        if(this.oldScreenWidth !== this.screenWidth){
            //if(this.chatCanvas.width < this.screenWidth)
                this.chatCanvas.width = this.screenWidth;
            this.oldScreenWidth = this.screenWidth;
        }


        // this.chatCanvas.width = this.screenWidth;
        // this.chatCtx.fillRect(0,0,10,10);

        this.onWindowResize();

        this.inputHandler.nameSettingActive = this.nameSettingActive;
        if(Math.random()<0.03)
            this.lastRoutineMs = Date.now() - startTime;
    }
    private onWindowResize() {

        this.chatCanvas.style.width = globalThis.innerWidth + 'px';
        this.chatCanvas.style.height = globalThis.innerHeight+ 'px';

    }

    private renderChatMessages() {
        const ctx = this.chatCtx;

        this.offscreenCtx.font = '8px Tiny5';
        this.offscreenCtx.fillStyle = 'white';

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
                pixOffsets.push(this.offscreenCtx.measureText(removedSubstring).width);
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
            this.localPlayer.name = usermsg + cursor;
            if (this.localPlayer.name.length == 0) this.localPlayer.name = ' ';
        }

        const wrappedLines: string[] = [];
        const lineOrigins: number[] = [];
        const isFirstWrappedLine: boolean[] = [];

        for (let i = 0; i < linesToRender.length; i++) {
            const wrapped = this.doTextWrapping(this.offscreenCtx, [linesToRender[i]], this.screenWidth - 10);
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

            this.renderPixelText(text, 3 + pixOffset, 200 - 20 - 8 * i, 'white');
        }

        if ((usermsg !== '' && this.localPlayer.chatActive) || this.nameSettingActive) {
            ctx.fillStyle = 'rgba(145,142,118,0.3)';
            let width = ctx.measureText(usermsg).width;
            if (this.nameSettingActive) {
                width = ctx.measureText('Enter your name: ' + usermsg).width;
            }
            ctx.fillRect(2, 200 - 20 - 7, width + 1, 9);
        }
    }
    private renderPrettyText(text: string, x: number, y: number, color: string) {

        // Set font to measure text
        this.offscreenCtx.font = '8px Tiny5';

        // Measure the text to determine the canvas size
        const textMetrics = this.offscreenCtx.measureText(text);
        const textWidth = Math.max(Math.ceil(textMetrics.width), 1);
        const textHeight = 8;

        // Resize the offscreen canvas if necessary
        if (this.offscreenCanvas.width !== textWidth || this.offscreenCanvas.height !== textHeight) {
            this.offscreenCanvas.width = textWidth;
            this.offscreenCanvas.height = textHeight;
        }

        // Clear the canvas before drawing
        this.offscreenCtx.clearRect(0, 0, textWidth, textHeight);

        // Set the font and fill style for drawing
        this.offscreenCtx.font = '8px Tiny5';
        this.offscreenCtx.fillStyle = color;

        // Draw the text onto the offscreen canvas
        this.offscreenCtx.fillText(text, 0, textHeight - 1);

        // Get the image data to apply pixelation
        const imageData = this.offscreenCtx.getImageData(0, 0, textWidth, textHeight);
        const data = imageData.data;

        // Apply a simple pixelation effect by adjusting the alpha channel
        for (let i = 0; i < data.length; i += 4) {
            data[i + 3] = data[i + 3] > 200 ? 255 : 0;
        }

        // Put the modified image data back onto the offscreen canvas
        this.offscreenCtx.putImageData(imageData, 0, 0);

        // Draw the offscreen canvas onto the main chat canvas at the specified coordinates
        this.chatCtx.drawImage(this.offscreenCanvas, x, y - textHeight + 1);
    }

    private renderUglyText(text: string, x: number, y: number, color: string) {
        this.chatCtx.font = '8px Tiny5';
        this.chatCtx.fillStyle = color;
        this.chatCtx.fillText(text, x, y);
    }

    private renderPixelText(text: string, x: number, y: number, color: string) {

        if(SettingsManager.settings.doPrettyText)
            this.renderPrettyText(text, x, y, color);
        else
            this.renderUglyText(text, x, y, color);

    }




    private renderDebugText() {

        const ctx = this.chatCtx;
        ctx.font = '8px Tiny5';
        ctx.fillStyle = 'teal';

        const linesToRender = [];
        const framerate = this.renderer.getFramerate();

        if (this.localPlayer.latency >= 999)
            linesToRender.push('disconnected :(');

        //const playerX = Math.round(this.localPlayer.position.x);

        linesToRender.push('candiru ' + this.localPlayer.gameVersion + ' @ ' + Math.round(framerate) + 'FPS');
        //linesToRender.push('routineTime: ' + this.lastRoutineMs + 'ms');

        for (let i = 0; i < linesToRender.length; i++) {
            this.renderPixelText(linesToRender[i], 2, 7 + 7 * i, 'teal');
        }

        this.debugTextHeight = 7 * linesToRender.length;
    }


    public renderTouchControls() {
        if(Date.now() / 1000 - this.lastTouchTimestamp > 10) return;
        if(this.touchJoystickEngaged) {
            //draw circle for movement
            this.chatCtx.fillStyle = 'rgba(255,255,255,0.25)';
            this.chatCtx.beginPath();
            this.chatCtx.arc(this.joystickX, this.joystickY, TouchInputHandler.joystickRadius, 0, 2 * Math.PI);
            this.chatCtx.fill();

            //smaller circle for joystick-- offset from center
            this.chatCtx.fillStyle = 'rgba(255,255,255,0.5)';
            this.chatCtx.beginPath();
            this.chatCtx.arc(this.joystickX + this.joystickInputX * TouchInputHandler.joystickRadius, this.joystickY + this.joystickInputY * TouchInputHandler.joystickRadius, 10, 0, 2 * Math.PI);
            this.chatCtx.fill();



        }

        // Draw rounded square center right for jumping
        const squareWidth = 24;
        const squareHeight = 24;
        const cornerRadius = 6;
        const x = this.chatCanvas.width - squareWidth - 12; // 10px from the right edge
        let y = (this.chatCanvas.height - squareHeight) / 2 ; // Center vertically

        this.drawButton(x, y, squareWidth, squareHeight, cornerRadius,'●',1,0);
        y-= squareHeight + 4;
        this.drawButton(x, y, squareWidth, squareHeight, cornerRadius,'↑',1,-1);
        y+= squareHeight + 4;
        y+= squareHeight + 4;
        this.drawButton(x, y, squareWidth, squareHeight, cornerRadius,'[]',1,1);

    }

    public setButtonsHeld(buttons: number[]) {
        this.buttonsHeld = buttons;
    }

    private drawButton(x:number, y:number, width:number, height:number, cornerRadius:number, text:string,textOffset:number, index:number) {
        if(this.buttonsHeld.includes(index))
            this.chatCtx.fillStyle = 'rgba(100,100,100,0.3)';
        else
            this.chatCtx.fillStyle = 'rgba(255,255,255,0.15)';

        this.drawRoundedSquare(x, y, width, height, cornerRadius);
        //draw character inside square
        this.chatCtx.fillStyle = 'rgba(0,0,0,0.5)';
        this.chatCtx.font = '16px Tiny5';
        const textWidth = this.chatCtx.measureText(text).width;
        this.chatCtx.fillText(text, Math.floor(x + width / 2 - textWidth / 2 + textOffset),Math.floor( y + height / 2 + 16 / 2 - 2));

    }

    private drawRoundedSquare(x: number, y: number, width: number, height: number, cornerRadius: number) {
        this.chatCtx.beginPath();
        this.chatCtx.moveTo(x + cornerRadius, y);
        this.chatCtx.lineTo(x + width - cornerRadius, y);
        this.chatCtx.quadraticCurveTo(x + width, y, x + width, y + cornerRadius);
        this.chatCtx.lineTo(x + width, y + height - cornerRadius);
        this.chatCtx.quadraticCurveTo(x + width, y + height, x + width - cornerRadius, y + height);
        this.chatCtx.lineTo(x + cornerRadius, y + height);
        this.chatCtx.quadraticCurveTo(x, y + height, x, y + height - cornerRadius);
        this.chatCtx.lineTo(x, y + cornerRadius);
        this.chatCtx.quadraticCurveTo(x, y, x + cornerRadius, y);
        this.chatCtx.closePath();
        this.chatCtx.fill();
    }

    public setLastTouchTimestamp(timestamp: number) {
        this.lastTouchTimestamp = timestamp;
    }
    public setTouchJoystickEngaged(value: boolean) {
        this.touchJoystickEngaged = value;
    }
    public setJoystickPosition(x: number, y: number) {
        this.joystickX = x;
        this.joystickY = y;
    }
    public setJoystickInput(x: number, y: number) {
        this.joystickInputX = x;
        this.joystickInputY = y;
    }

    public renderHitMarkers() {
        const numDots = 10; // Number of dots to render around each hit point

        for (let i = this.renderer.playerHitMarkers.length - 1; i >= 0; i--) {
            if (this.renderer.playerHitMarkers[i].timestamp === -1)
                this.renderer.playerHitMarkers[i].timestamp = Date.now() / 1000; // Set timestamp if not set

            const timeSinceHit = Date.now() / 1000 - this.renderer.playerHitMarkers[i].timestamp;
            const lifePercent = timeSinceHit / hitMarkerLifetime;

            if (timeSinceHit > hitMarkerLifetime) {
                this.renderer.playerHitMarkers.splice(i, 1);
                continue;
            }

            const hitVec = this.renderer.playerHitMarkers[i].hitPoint;
            const projected = hitVec.clone().project(this.renderer.getCamera());
            const projectedX = Math.round((projected.x + 1) * this.screenWidth / 2);
            const projectedY = Math.round((-projected.y + 1) * 200 / 2);

            if (projected.z < 1) {
                this.chatCtx.fillStyle = 'rgba(255,0,0,' + (1 - Math.pow(lifePercent, 1.25)) + ')';

                // Calculate sizeMultiplier
                const sizeMultiplier = 1 + 2 / this.renderer.playerHitMarkers[i].shotVector.length();

                // Calculate and render dots
                const radius = Math.pow(lifePercent, 0.7) * 7 * sizeMultiplier; // Radius of the circle in which dots are placed
                for (let j = 0; j < numDots; j++) {
                    const angle = (Math.PI * 2 / numDots) * j;
                    const dotX = Math.round(projectedX + radius * Math.cos(angle));
                    const dotY = Math.round(projectedY + radius * Math.sin(angle));

                    this.chatCtx.fillRect(dotX, dotY, 1, 1); // Render a 1px by 1px dot
                }
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
            this.renderPixelText(linesToRender[i], Math.floor(this.screenWidth / 2 - longestLinePix / 2 + 2), 11 + 7 * i, colorsToRender[i]);
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
        ctx.fillStyle = SettingsManager.settings.crosshairColor;
        if (this.renderer.crosshairIsFlashing)
            ctx.fillStyle = '#FF0000';
        switch (SettingsManager.settings.crosshairType) {
            case 0:
                ctx.fillRect(Math.floor(this.screenWidth / 2), 100 - 3, 1, 7);
                ctx.fillRect(Math.floor(this.screenWidth / 2 - 3), 100, 7, 1);
                break;
            case 1:
                ctx.fillRect(Math.floor(this.screenWidth / 2), 100, 1, 1);
                break;
        }
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