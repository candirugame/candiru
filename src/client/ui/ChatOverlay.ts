import { Renderer } from '../core/Renderer.ts';
import { Networking } from '../core/Networking.ts';
import { InputHandler } from '../input/InputHandler.ts';
import { CommandManager } from '../core/CommandManager.ts';
import { SettingsManager } from '../core/SettingsManager.ts';
import { TouchInputHandler } from '../input/TouchInputHandler.ts';
import { Player } from '../../shared/Player.ts';
import * as THREE from 'three';

interface ChatMessage {
	id: number;
	message: string;
	name: string;
	timestamp: number;
}

interface AnimatedGameMessage {
	id: string; // Unique identifier
	message: string;
	state: 'animatingIn' | 'animatingOut' | 'idle';
	animationProgress: number; // Ranges from 0 to 1
	timestamp: number; // Time when the current animation state started
}

interface LineMessage {
	currentMessage: AnimatedGameMessage | null;
	pendingMessage: string | null;
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
	private oldScreenWidth: number = 0;
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

	public gameMessages: string[] = [];
	private previousGameMessages: string[] = [];

	// Removed animatedGameMessages in favor of per-line management
	private lines: LineMessage[] = [];
	private animationDuration: number = 1; // Adjusted for smoother animation

	// Color code mapping
	COLOR_CODES: { [key: string]: string } = {
		'0': '#000000', // Black
		'1': '#0000AA', // Dark Blue
		'2': '#00AA00', // Dark Green
		'3': '#00AAAA', // Dark Aqua
		'4': '#AA0000', // Dark Red
		'5': '#AA00AA', // Dark Purple
		'6': '#FFAA00', // Gold
		'7': '#AAAAAA', // Gray
		'8': '#555555', // Dark Gray
		'9': '#5555FF', // Blue
		'a': '#55FF55', // Green
		'b': '#55FFFF', // Aqua
		'c': '#FF5555', // Red
		'd': '#FF55FF', // Light Purple
		'e': '#FFFF55', // Yellow
		'f': '#FFFFFF', // White
		'g': this.getRainbowColor(),
	};

	private getColorCode(code: string): string | false {
		if (code === 'g') {
			return this.getRainbowColor();
		}
		return this.COLOR_CODES[code] || false;
	}

	private getRainbowColor(): string {
		const hue = (Date.now() / 20) % 360;
		return `hsl(${hue}, 100%, 50%)`;
	}

	constructor(container: HTMLElement, localPlayer: Player) {
		this.localPlayer = localPlayer;
		this.chatCanvas = document.createElement('canvas');
		this.chatCtx = this.chatCanvas.getContext('2d') as CanvasRenderingContext2D;
		this.chatCtx.imageSmoothingEnabled = false;

		this.chatCanvas.width = 400;
		this.chatCanvas.height = 200;

		this.chatMessages = [];
		this.chatMessageLifespan = 40; // 40 seconds
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

		// Initialize lines for per-line message management
		this.lines = Array(this.maxMessagesOnScreen).fill(null).map(() => ({
			currentMessage: null,
			pendingMessage: null,
		}));

		//document.body.appendChild(this.chatCanvas);
		container.appendChild(this.chatCanvas);

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
		const now = Date.now() / 1000;

		this.gameMessages = this.localPlayer.gameMsgs;
		this.detectGameMessagesChanges(now);
		this.updateAnimatedGameMessages(now);

		this.clearOldMessages();
		this.chatCtx.clearRect(0, 0, this.chatCanvas.width, this.chatCanvas.height);

		this.renderHitMarkers();
		this.renderSparkles();

		this.renderChatMessages();
		this.renderGameText();
		this.renderDebugText();
		if (this.inputHandler.getKey('tab')) {
			this.renderPlayerList();
		}
		this.renderEvil();
		this.renderCrosshair();
		this.renderTouchControls();

		this.screenWidth = Math.floor(this.renderer.getCamera().aspect * 200);

		if (this.oldScreenWidth !== this.screenWidth) {
			//if(this.chatCanvas.width < this.screenWidth)
			this.chatCanvas.width = this.screenWidth;
			this.oldScreenWidth = this.screenWidth;
		}

		// this.chatCanvas.width = this.screenWidth;
		// this.chatCtx.fillRect(0,0,10,10);

		this.onWindowResize();

		this.inputHandler.nameSettingActive = this.nameSettingActive;
		if (Math.random() < 0.03) {
			this.lastRoutineMs = Date.now() - startTime;
		}
	}

	private onWindowResize() {
		this.chatCanvas.style.width = globalThis.innerWidth + 'px';
		this.chatCanvas.style.height = globalThis.innerHeight + 'px';
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
			if (this.localPlayer.chatMsg.startsWith('>')) {
				linesToRender.push('&2' + usermsg + cursor);
			} else {
				linesToRender.push(usermsg + cursor);
			}
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

	private renderPrettyText(text: string, x: number, y: number, defaultColor: string) {
		let currentX = x;
		const segments: { text: string; color: string }[] = [];
		let currentColor = defaultColor;
		let currentSegment = '';

		// Parse color codes and split into segments
		for (let i = 0; i < text.length; i++) {
			if (text[i] === '&' && i + 1 < text.length && this.getColorCode(text[i + 1])) {
				if (currentSegment) {
					segments.push({ text: currentSegment, color: currentColor });
				}
				currentColor = <string> this.getColorCode(text[i + 1]);
				currentSegment = '';
				i++; // Skip the color code character
			} else {
				currentSegment += text[i];
			}
		}

		if (currentSegment) {
			segments.push({ text: currentSegment, color: currentColor });
		}

		// Render each segment
		for (const segment of segments) {
			this.offscreenCtx.font = '8px Tiny5';
			const textMetrics = this.offscreenCtx.measureText(segment.text);
			const textWidth = Math.max(Math.ceil(textMetrics.width), 1);
			const textHeight = 8;

			if (this.offscreenCanvas.width !== textWidth || this.offscreenCanvas.height !== textHeight) {
				this.offscreenCanvas.width = textWidth;
				this.offscreenCanvas.height = textHeight;
			}

			this.offscreenCtx.clearRect(0, 0, textWidth, textHeight);
			this.offscreenCtx.font = '8px Tiny5';
			this.offscreenCtx.fillStyle = segment.color;
			this.offscreenCtx.fillText(segment.text, 0, textHeight - 1);

			const imageData = this.offscreenCtx.getImageData(0, 0, textWidth, textHeight);
			const data = imageData.data;

			for (let i = 0; i < data.length; i += 4) {
				data[i + 3] = data[i + 3] > 170 ? 255 : 0;
			}

			this.offscreenCtx.putImageData(imageData, 0, 0);
			this.chatCtx.drawImage(this.offscreenCanvas, currentX, y - textHeight + 1);
			currentX += textWidth;
		}
	}

	private renderUglyText(text: string, x: number, y: number, defaultColor: string) {
		let currentX = x;
		let currentColor = defaultColor;
		let currentSegment = '';

		for (let i = 0; i < text.length; i++) {
			if (text[i] === '&' && i + 1 < text.length && this.getColorCode(text[i + 1])) {
				if (currentSegment) {
					this.chatCtx.font = '8px Tiny5';
					this.chatCtx.fillStyle = currentColor;
					this.chatCtx.fillText(currentSegment, currentX, y);
					currentX += this.chatCtx.measureText(currentSegment).width;
				}
				currentColor = <string> this.getColorCode(text[i + 1]);
				currentSegment = '';
				i++; // Skip the color code character
			} else {
				currentSegment += text[i];
			}
		}

		if (currentSegment) {
			this.chatCtx.font = '8px Tiny5';
			this.chatCtx.fillStyle = currentColor;
			this.chatCtx.fillText(currentSegment, currentX, y);
		}
	}

	private renderPixelText(text: string, x: number, y: number, color: string) {
		if (SettingsManager.settings.doPrettyText) {
			this.renderPrettyText(text, x, y, color);
		} else {
			this.renderUglyText(text, x, y, color);
		}
	}

	private renderDebugText() {
		const ctx = this.chatCtx;
		ctx.font = '8px Tiny5';
		ctx.fillStyle = 'teal';

		const linesToRender = [];
		const framerate = this.renderer.getFramerate();

		if (this.localPlayer.latency >= 999) {
			linesToRender.push('disconnected :(');
		}

		//const playerX = Math.round(this.localPlayer.position.x);

		linesToRender.push(
			'candiru ' + this.localPlayer.gameVersion + ' @ ' + Math.round(framerate) + 'fps, ' +
				Math.round(this.localPlayer.latency) + 'ms',
		);
		//linesToRender.push('connected to: ' + this.networking.getServerInfo().name);
		//linesToRender.push('players: ' + this.networking.getServerInfo().currentPlayers + '/' + this.networking.getServerInfo().maxPlayers);
		//linesToRender.push('map: ' + this.networking.getServerInfo().mapName);
		//linesToRender.push('mode: ' + this.networking.getServerInfo().gameMode);
		//linesToRender.push('serverVersion: ' + this.networking.getServerInfo().version);
		//linesToRender.push('tickRate: ' + this.networking.getServerInfo().tickRate);
		//linesToRender.push('playerMaxHealth: ' + this.networking.getServerInfo().playerMaxHealth);
		//linesToRender.push('health: ' + this.localPlayer.health);
		//linesToRender.push('pos:' +this.localPlayer.position.x.toFixed(2) + ',' + this.localPlayer.position.y.toFixed(2) + ',' +this.localPlayer.position.z.toFixed(2),);

		for (const msg of this.localPlayer.gameMsgs2) {
			linesToRender.push(msg);
		}

		//linesToRender.push('routineTime: ' + this.lastRoutineMs + 'ms');

		for (let i = 0; i < linesToRender.length; i++) {
			this.renderPixelText(linesToRender[i], 2, 7 + 7 * i, 'teal');
		}

		this.debugTextHeight = 7 * linesToRender.length;
	}

	private detectGameMessagesChanges(now: number) {
		const current = this.gameMessages;

		for (let i = 0; i < this.maxMessagesOnScreen; i++) {
			const line = this.lines[i];
			const currentMessage = current[i] || null;

			if (!line.currentMessage) {
				if (currentMessage) {
					line.currentMessage = {
						id: this.generateUniqueId(),
						message: currentMessage,
						state: 'animatingIn',
						animationProgress: 0,
						timestamp: now,
					};
				}
				continue;
			}

			if (currentMessage !== line.currentMessage.message) {
				if (line.currentMessage.state === 'idle') {
					line.currentMessage.state = 'animatingOut';
					line.currentMessage.timestamp = now;
					line.pendingMessage = currentMessage;
				} else {
					line.pendingMessage = currentMessage;
				}
			}
		}

		this.previousGameMessages = [...current];
	}

	private updateAnimatedGameMessages(now: number) {
		for (let i = 0; i < this.maxMessagesOnScreen; i++) {
			const line = this.lines[i];
			if (!line.currentMessage) continue; // Early return if null

			const elapsed = now - line.currentMessage.timestamp;
			let progress = Math.min(elapsed / this.animationDuration, 1);
			progress = this.easeOut(progress);

			line.currentMessage.animationProgress = progress;

			if (line.currentMessage.state === 'animatingOut' && progress >= 1) {
				// Remove the message after fade-out
				if (line.pendingMessage) {
					line.currentMessage = {
						id: this.generateUniqueId(),
						message: line.pendingMessage,
						state: 'animatingIn',
						animationProgress: 0,
						timestamp: now,
					};
					line.pendingMessage = null;
				} else {
					line.currentMessage = null;
				}
				continue;
			}

			if (line.currentMessage.state === 'animatingIn' && progress >= 1) {
				line.currentMessage.state = 'idle';
				line.currentMessage.animationProgress = 1;
			}
		}
	}

	private renderGameText() {
		const ctx = this.chatCtx;
		ctx.font = '8px Tiny5';
		const centerY = this.chatCanvas.height / 2 + 48;

		for (let i = 0; i < this.maxMessagesOnScreen; i++) {
			const line = this.lines[i];
			if (!line.currentMessage) continue;

			let visibleText = line.currentMessage.message;

			// Check if we should skip animation
			const shouldSkipAnimation = line.currentMessage.state === 'animatingOut' &&
				line.pendingMessage !== null &&
				line.currentMessage.message.includes('seconds') &&
				line.pendingMessage.includes('seconds');

			if (shouldSkipAnimation && line.pendingMessage) {
				// Directly update to the pending message
				line.currentMessage = {
					id: this.generateUniqueId(),
					message: line.pendingMessage,
					state: 'idle',
					animationProgress: 1,
					timestamp: Date.now() / 1000,
				};
				line.pendingMessage = null;
				visibleText = line.currentMessage.message;
			} else if (line.currentMessage.state === 'animatingIn' || line.currentMessage.state === 'animatingOut') {
				visibleText = this.getVisibleText(
					line.currentMessage.message,
					line.currentMessage.state,
					line.currentMessage.animationProgress,
				);
			}

			// Calculate the actual width of the rendered text, including color codes
			const textWidth = this.getRenderedTextWidth(visibleText);
			const x = Math.floor((this.screenWidth - textWidth) / 2);
			const y = Math.floor(centerY + (i * 10));

			this.renderPixelText(visibleText, x, y, 'white');
		}
	}

	private getRenderedTextWidth(text: string): number {
		let totalWidth = 0;
		let currentSegment = '';
		const ctx = this.chatCtx;

		for (let i = 0; i < text.length; i++) {
			if (text[i] === '&' && i + 1 < text.length && this.getColorCode(text[i + 1])) {
				// Measure the current segment before switching color
				if (currentSegment) {
					totalWidth += ctx.measureText(currentSegment).width;
					currentSegment = '';
				}
				i++; // Skip the color code character
			} else {
				currentSegment += text[i];
			}
		}

		// Measure the last segment
		if (currentSegment) {
			totalWidth += ctx.measureText(currentSegment).width;
		}

		return totalWidth;
	}

	private getVisibleText(message: string, state: 'animatingIn' | 'animatingOut' | 'idle', progress: number): string {
		if (state === 'idle') {
			return message;
		}

		const length = message.length;
		if (length === 0) return '';

		let charsToShow = 0;

		if (state === 'animatingIn') {
			charsToShow = Math.floor(progress * length);
			charsToShow = Math.min(charsToShow, length); // Ensure it doesn't exceed the message length
			return message.substring(0, charsToShow);
		} else if (state === 'animatingOut') {
			charsToShow = Math.floor((1 - progress) * length);
			charsToShow = Math.max(charsToShow, 0); // Ensure it doesn't go below zero
			return message.substring(0, charsToShow);
		}

		return message;
	}

	private easeOut(progress: number): number {
		return 1 - Math.pow(1 - progress, 1.5);
	}

	public renderTouchControls() {
		if (Date.now() / 1000 - this.lastTouchTimestamp > 10) return;
		if (this.touchJoystickEngaged) {
			// Draw circle for movement
			this.chatCtx.fillStyle = 'rgba(255,255,255,0.25)';
			this.chatCtx.beginPath();
			this.chatCtx.arc(this.joystickX, this.joystickY, TouchInputHandler.joystickRadius, 0, 2 * Math.PI);
			this.chatCtx.fill();

			// Smaller circle for joystick-- offset from center
			this.chatCtx.fillStyle = 'rgba(255,255,255,0.5)';
			this.chatCtx.beginPath();
			this.chatCtx.arc(
				this.joystickX + this.joystickInputX * TouchInputHandler.joystickRadius,
				this.joystickY + this.joystickInputY * TouchInputHandler.joystickRadius,
				10,
				0,
				2 * Math.PI,
			);
			this.chatCtx.fill();
		}

		// Draw rounded square center right for jumping
		const squareWidth = 24;
		const squareHeight = 24;
		const cornerRadius = 6;
		const x = this.chatCanvas.width - squareWidth - 12; // 12px from the right edge
		let y = (this.chatCanvas.height - squareHeight) / 2; // Center vertically

		this.drawButton(x, y, squareWidth, squareHeight, cornerRadius, '●', 1, 0);
		y -= squareHeight + 4;
		this.drawButton(x, y, squareWidth, squareHeight, cornerRadius, '↑', 1, -1);
		y += squareHeight + 4;
		y += squareHeight + 4;
		this.drawButton(x, y, squareWidth, squareHeight, cornerRadius, '[]', 1, 1);
	}

	public setButtonsHeld(buttons: number[]) {
		this.buttonsHeld = buttons;
	}

	private drawButton(
		x: number,
		y: number,
		width: number,
		height: number,
		cornerRadius: number,
		text: string,
		textOffset: number,
		index: number,
	) {
		if (this.buttonsHeld.includes(index)) {
			this.chatCtx.fillStyle = 'rgba(100,100,100,0.3)';
		} else {
			this.chatCtx.fillStyle = 'rgba(255,255,255,0.15)';
		}

		this.drawRoundedSquare(x, y, width, height, cornerRadius);
		// Draw character inside square
		this.chatCtx.fillStyle = 'rgba(0,0,0,0.5)';
		this.chatCtx.font = '16px Tiny5';
		const textWidth = this.chatCtx.measureText(text).width;
		this.chatCtx.fillText(
			text,
			Math.floor(x + width / 2 - textWidth / 2 + textOffset),
			Math.floor(y + height / 2 + 16 / 2 - 2),
		);
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

	private getProjected3D(vec3: THREE.Vector3): { x: number; y: number } {
		const projected = vec3.clone().project(this.renderer.getCamera());
		return {
			x: Math.round((projected.x + 1) * this.screenWidth / 2),
			y: Math.round((-projected.y + 1) * 200 / 2),
		};
	}

	private getSize(distance: number): number {
		// Convert world distance to a screen-space scaling factor
		// This helps match the scaling of the underlying 3D scene
		const fov = this.renderer.getCamera().fov; // in degrees
		const fovRadians = (fov * Math.PI) / 180;

		// Calculate apparent size based on FOV and distance
		// This gives us a size that matches the perspective of the 3D scene
		const size = Math.tan(fovRadians / 2) / distance;

		// Scale factor to make the size reasonable for screen space
		// Adjust this based on your desired base size
		const scaleFactor = 9;

		return size * scaleFactor;
	}

	private sparkleParticles: {
		basePos: THREE.Vector3;
		offset: THREE.Vector3;
		speed: number;
		phase: number;
		radius: number;
	}[] = [];

	private readonly SPARKLE_COUNT = 6;
	private readonly SPARKLE_RADIUS = 0.5; // World units instead of screen pixels

	public renderSparkles() {
		const positions = this.networking.getServerInfo().highlightedVectors.slice(0);
		//const positions = [new THREE.Vector3(0, 3 + Math.sin(Date.now() / 1000), 0)];

		// Initialize or update sparkle particles
		while (this.sparkleParticles.length < positions.length * this.SPARKLE_COUNT) {
			this.sparkleParticles.push({
				basePos: new THREE.Vector3(),
				offset: new THREE.Vector3(
					Math.random() * 2 - 1,
					Math.random() * 2 - 1,
					Math.random() * 2 - 1,
				).normalize(),
				speed: 0.5 + Math.random() * 1.5,
				phase: Math.random() * Math.PI * 2,
				radius: this.SPARKLE_RADIUS * (0.5 + Math.random() * 0.5),
			});
		}

		// Remove excess particles
		while (this.sparkleParticles.length > positions.length * this.SPARKLE_COUNT) {
			this.sparkleParticles.pop();
		}

		const ctx = this.chatCtx;
		ctx.fillStyle = 'rgba(46,163,46,0.8)';
		const time = Date.now() / 1000;

		// Update and render each sparkle
		for (let i = 0; i < positions.length; i++) {
			const basePos = positions[i];

			// Update and draw sparkles for this position
			for (let j = 0; j < this.SPARKLE_COUNT; j++) {
				const particle = this.sparkleParticles[i * this.SPARKLE_COUNT + j];
				particle.basePos.copy(basePos);

				// Calculate 3D orbital motion
				const angle = particle.phase + time * particle.speed;
				const wobble = Math.sin(time * 3 + particle.phase) * 0.3;

				// Create orbital motion around the base position
				const orbitPos = new THREE.Vector3().copy(particle.offset)
					.multiplyScalar(particle.radius * (1 + wobble))
					.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
					.add(particle.basePos);

				// Project to screen space
				const projected = this.getProjected3D(orbitPos);

				// Skip if behind camera
				if (orbitPos.clone().project(this.renderer.getCamera()).z >= 1) continue;

				// Calculate size based on distance to camera
				const distance = orbitPos.distanceTo(this.renderer.getCamera().position);
				const size = Math.max(1, Math.min(3, this.getSize(distance) * 0.5));

				// Draw particle
				ctx.fillRect(
					Math.round(projected.x - size / 2),
					Math.round(projected.y - size / 2),
					Math.ceil(size),
					Math.ceil(size),
				);
			}
		}
	}

	public renderHitMarkers() {
		for (let i = this.renderer.playerHitMarkers.length - 1; i >= 0; i--) {
			if (this.renderer.playerHitMarkers[i].timestamp === -1) {
				this.renderer.playerHitMarkers[i].timestamp = Date.now() / 1000;
			}

			const timeSinceHit = Date.now() / 1000 - this.renderer.playerHitMarkers[i].timestamp;
			const lifePercent = timeSinceHit / hitMarkerLifetime;

			if (timeSinceHit > hitMarkerLifetime) {
				this.renderer.playerHitMarkers.splice(i, 1);
				continue;
			}

			const hitVec = this.renderer.playerHitMarkers[i].hitPoint;
			const projected = this.getProjected3D(hitVec);

			if (hitVec.clone().project(this.renderer.getCamera()).z < 1) {
				this.chatCtx.fillStyle = 'rgba(255,0,0,' + (1 - Math.pow(lifePercent, 1.25)) + ')';

				const sizeMultiplier = this.getSize(this.renderer.playerHitMarkers[i].shotVector.length());
				const radius = Math.pow(lifePercent, 0.7) * 7 * sizeMultiplier;
				const numDots = Math.min(Math.max(sizeMultiplier * 5, 3), 15);

				for (let j = 0; j < numDots; j++) {
					const angle = (Math.PI * 2 / numDots) * j;
					const dotX = Math.round(projected.x + radius * Math.cos(angle));
					const dotY = Math.round(projected.y + radius * Math.sin(angle));
					const dotSize = Math.min(Math.max(Math.round(sizeMultiplier / 3), 1), 6);
					this.chatCtx.fillRect(
						Math.floor(dotX - dotSize / 2),
						Math.floor(dotY - dotSize / 2),
						Math.ceil(dotSize),
						Math.ceil(dotSize),
					);
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
			if (playerData[i].latency > 200) {
				colorsToRender.push('red');
			} else if (playerData[i].latency > 50) {
				colorsToRender.push('orange');
			} else {
				colorsToRender.push('green');
			}
		}

		ctx.font = '8px Tiny5';

		let longestLinePix = 0;
		for (let i = 0; i < linesToRender.length; i++) {
			longestLinePix = Math.max(longestLinePix, ctx.measureText(linesToRender[i]).width);
		}

		ctx.fillStyle = 'rgba(0,0,0,0.5)';
		ctx.fillRect(
			Math.floor(this.screenWidth / 2 - longestLinePix / 2),
			4,
			longestLinePix + 3,
			linesToRender.length * 7 + 2,
		);

		for (let i = 0; i < linesToRender.length; i++) {
			this.renderPixelText(
				linesToRender[i],
				Math.floor(this.screenWidth / 2 - longestLinePix / 2 + 2),
				11 + 7 * i,
				colorsToRender[i],
			);
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
		if (this.renderer.crosshairIsFlashing) {
			ctx.fillStyle = '#FF0000';
		}
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
				if (!this.commandManager.runCmd(this.localPlayer.chatMsg)) {
					this.networking.sendMessage(this.localPlayer.chatMsg);
				}
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

		if ((this.localPlayer.chatActive) && e.key.length === 1 && this.localPlayer.chatMsg.length < 300) {
			this.localPlayer.chatMsg += e.key;
		}

		if ((this.nameSettingActive) && e.key.length === 1 && this.localPlayer.chatMsg.length < 42) {
			this.localPlayer.chatMsg += e.key;
		}

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

		if (e.key.toLowerCase() === 'n' && !this.localPlayer.chatActive) {
			this.nameSettingActive = true;
		}
	}

	public addChatMessage(msg: { id: number; name: string; message: string }) {
		const chatMessage: ChatMessage = {
			id: msg.id,
			name: msg.name,
			message: msg.message,
			timestamp: Date.now() / 1000,
		};
		this.chatMessages.push(chatMessage);
	}

	private clearOldMessages() {
		for (let i = 0; i < this.chatMessages.length; i++) {
			if (Date.now() / 1000 - this.chatMessages[i].timestamp > this.chatMessageLifespan + 5) {
				this.chatMessages.splice(i, 1);
			}
		}

		for (let i = this.chatMessages.length - 1; i >= 0; i--) {
			if (i < this.chatMessages.length - this.maxMessagesOnScreen) {
				this.chatMessages[i].timestamp = Math.min(
					Date.now() / 1000 - this.chatMessageLifespan,
					this.chatMessages[i].timestamp,
				);
			}
		}
	}

	private doTextWrapping(
		ctx: CanvasRenderingContext2D,
		text: string[],
		maxWidth: number,
		initialOffset: number = 0,
	): string[] {
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

	private generateUniqueId(): string {
		return Math.random().toString(36).substr(2, 9);
	}
}
