import { Renderer } from '../core/Renderer.ts';
import { Networking } from '../core/Networking.ts';
import { InputHandler } from '../input/InputHandler.ts';
import { SpriteManager } from './SpriteManager.ts';
import { CommandManager } from '../core/CommandManager.ts';
import { SettingsManager } from '../core/SettingsManager.ts';
import { TouchInputHandler } from '../input/TouchInputHandler.ts';
import { Player } from '../../shared/Player.ts';
import * as THREE from 'three';
import { Game } from '../core/Game.ts';

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

interface AnimatedEventMessage {
	id: string;
	message: string;
	state: 'animatingIn' | 'animatingOut' | 'idle';
	animationProgress: number;
	timestamp: number;
	lifetime: number;
}

interface LineMessage {
	currentMessage: AnimatedGameMessage | null;
	pendingMessage: string | null;
}

const hitMarkerLifetime = 0.3;

export class ChatOverlay {
	public chatCanvas: HTMLCanvasElement;
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
	private containerElement: HTMLElement;
	private spriteManager: SpriteManager;

	private gameIndex: number;

	private offscreenCanvas: HTMLCanvasElement;
	private offscreenCtx: CanvasRenderingContext2D;

	// Smooth animation state for durability bar horizontal offset
	private durabilityBarOffset: number = 0; // in canvas pixels

	// Animation progress for inventory per-item bars (0..1)
	private inventoryBarsProgress: number = 0;
	// Smoothed tracking of inventory camera Y (in ortho units), to match animation
	private inventoryBarsCameraY: number = 0;

	public gameMessages: string[] = [];
	private eventMessages: AnimatedEventMessage[] = [];
	private maxEventMessages = 4;
	private eventMessageLifetime = 40; // seconds
	private eventAnimationCharsPerSecond = 50;

	private lines: LineMessage[] = [];
	private animationDuration: number = 0.75;

	// Color code mapping
	public static COLOR_CODES: { [key: string]: string } = {
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

	public static SPRITE_CODES: { [key: string]: string } = {
		'a': 'redguy_8px',
		'b': 'yellowguy',
		'c': 'banana1',
		'd': 'banana2',
		'e': 'fish1',
		'f': 'fish2',
		'g': 'bottle1',
		'h': 'bottle2',
		'i': 'pipe1',
		'j': 'pipe2',
	};

	public destroy() {
		this.chatCanvas.remove();
		this.offscreenCanvas.remove();
		this.lines = [];
		this.gameMessages = [];
	}

	private getColorCode(code: string): string | false {
		if (code === 'g') {
			return ChatOverlay.getRainbowColor();
		}
		return ChatOverlay.COLOR_CODES[code] || false;
	}

	private static getRainbowColor(): string {
		const hue = (Date.now() / 20) % 360;
		return `hsl(${hue}, 100%, 50%)`;
	}

	constructor(container: HTMLElement, localPlayer: Player, gameIndex: number) {
		this.localPlayer = localPlayer;
		this.containerElement = container;
		this.gameIndex = gameIndex;
		this.chatCanvas = document.createElement('canvas');
		this.chatCtx = this.chatCanvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
		this.chatCtx.imageSmoothingEnabled = false;

		this.spriteManager = new SpriteManager();

		this.chatCanvas.width = 400;
		this.chatCanvas.height = 200;

		this.chatMessages = [];
		this.chatMessageLifespan = 40; // 40 seconds
		this.charsToRemovePerSecond = 30;
		this.maxMessagesOnScreen = 32;

		this.nameSettingActive = false;
		this.screenWidth = 100;

		this.commandManager = new CommandManager(this.localPlayer, this);

		this.setupEventListeners();

		this.chatCanvas.style.position = 'absolute';
		this.chatCanvas.style.display = 'block';
		this.chatCanvas.style.zIndex = '40';
		this.chatCanvas.style.top = '0';
		this.chatCanvas.style.left = '0';

		this.chatCanvas.style.height = '100%';
		this.chatCanvas.style.width = '100%';
		this.chatCanvas.style.imageRendering = 'pixelated';
		this.chatCanvas.style.textRendering = 'pixelated';

		this.chatCanvas.style.touchAction = 'none';

		this.offscreenCanvas = document.createElement('canvas');
		this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;

		// Initialize lines for per-line message management
		this.lines = Array(this.maxMessagesOnScreen).fill(null).map(() => ({
			currentMessage: null,
			pendingMessage: null,
		}));

		container.appendChild(this.chatCanvas);

		globalThis.addEventListener('resize', this.onWindowResize.bind(this));
		globalThis.addEventListener('orientationchange', this.onWindowResize.bind(this));

		// Initial resize
		this.onWindowResize();
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
		this.updateAnimatedEventMessages(now);

		this.clearOldMessages();
		this.chatCtx.clearRect(0, 0, this.chatCanvas.width, this.chatCanvas.height);

		this.renderSniperOverlay();

		this.renderHitMarkers();

		this.renderChatMessages();
		this.renderGameText();
		this.renderEventMessages();
		this.renderDebugText();
		if (this.inputHandler.getKey('tab')) {
			this.renderPlayerList();
		}
		this.renderEvil();
		this.renderCrosshair();
		this.renderDurabilityBar();
		this.renderInventoryDurabilityBars();
		this.renderTouchControls();

		// Periodically check if we need to resize
		if (Math.random() < 0.05) {
			this.onWindowResize();
		}

		this.inputHandler.nameSettingActive = this.nameSettingActive;
		if (Math.random() < 0.03) {
			this.lastRoutineMs = Date.now() - startTime;
		}
	}

	// Draw small horizontal durability bars for each item row inside the inventory viewport.
	// Fades/scales in when the inventory is visible, fades out when hidden.
	private renderInventoryDurabilityBars() {
		if (!this.renderer) return;
		const player = this.networking.getSpectatedPlayer?.() ?? this.networking.getLocalPlayer?.();
		if (!player) return;
		const inventory = player.inventory as Array<{ durability?: number; itemId?: number }> | undefined;
		if (!inventory || inventory.length === 0) return;

		// Determine inventory viewport in canvas pixels to align the overlay
		const spp = this.renderer.getScreenPixelsInGamePixel(); // screen px per game px in the vertical axis
		const invWidthGamePx = 20;
		const invHeightGamePx = invWidthGamePx * 5; // 100
		const paddingScreenPx = 10; // from renderer scissor
		const paddingCanvasPx = paddingScreenPx / spp; // convert to canvas px

		const invWidthCanvasPx = invWidthGamePx; // 20
		const invHeightCanvasPx = invHeightGamePx; // 100
		const invX = this.chatCanvas.width - invWidthCanvasPx - paddingCanvasPx;
		const invY = Math.floor((this.chatCanvas.height - invHeightCanvasPx) / 2);
		const invCenterY = invY + invHeightCanvasPx / 2;

		// Animate visibility
		const target = this.renderer.isInventoryVisible() ? 1 : 0;
		const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
		this.inventoryBarsProgress = lerp(this.inventoryBarsProgress, target, 0.25);
		if (this.inventoryBarsProgress < 0.01) return; // effectively hidden

		// Track the actual inventory camera Y so bars follow the same smooth motion.
		//7 canvas pixels
		// When (re)appearing, snap to avoid lag during first frames
		// this.inventoryBarsCameraY = lerp(this.inventoryBarsCameraY, targetCamY, 0.2);
		this.inventoryBarsCameraY = this.renderer.getInventoryMenuCamera().position.y + (8.5 / 20); //7 canvas pixels

		// The camera centers on the selected row; 1 ortho unit == 20 canvas px (since 5 units -> 100px)
		const camY = this.inventoryBarsCameraY;
		const unitPx = 20; // 100px / 5 units

		// Style constants
		const barInnerMarginX = 3; // left/right margin inside inventory viewport
		const barWidthMax = invWidthCanvasPx - barInnerMarginX * 2; // max width available
		const barHeight = 1;
		const bgAlpha = 0.35 * this.inventoryBarsProgress;
		const fgAlpha = 0.9 * this.inventoryBarsProgress;

		const ctx = this.chatCtx;
		ctx.save();
		ctx.globalAlpha = 1;

		// Clip drawing to inventory viewport to avoid artifacts
		ctx.beginPath();
		ctx.rect(invX, invY, invWidthCanvasPx, invHeightCanvasPx);
		ctx.clip();

		// Draw for items near the viewport (limit to +/- 3 around selected)
		const approxCenterIndex = Math.round(camY);
		const minIdx = Math.max(0, approxCenterIndex - 3);
		const maxIdx = Math.min(inventory.length - 1, approxCenterIndex + 3);
		for (let i = minIdx; i <= maxIdx; i++) {
			let d = Number(inventory[i]?.durability);
			if (!Number.isFinite(d)) continue;
			if (d > 1.0001 && d <= 100) d = d / 100; // normalize legacy data
			d = Math.max(0, Math.min(1, d));

			// Row vertical position: center plus offset in units -> pixels
			// Use cameraY - index so increasing camera Y moves rows down on screen (matching renderer)
			const offsetUnits = camY - i; // positive means lower on screen
			const rowCenterY = invCenterY + offsetUnits * unitPx;
			const barY = Math.round(rowCenterY - barHeight / 2);
			const barX = Math.round(invX + barInnerMarginX + (1 - this.inventoryBarsProgress) * barWidthMax);

			// Background track
			ctx.fillStyle = `rgba(0,0,0,${bgAlpha.toFixed(3)})`;
			ctx.fillRect(barX, barY, barWidthMax, barHeight);

			// Foreground fill: color from green->red and animated width
			const hue = Math.round(120 * d);
			ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${fgAlpha.toFixed(3)})`;
			const w = Math.round(barWidthMax * d * this.inventoryBarsProgress);
			if (w > 0) ctx.fillRect(barX, barY, w, barHeight);
		}

		ctx.restore();
	}

	private onWindowResize() {
		// Use container dimensions instead of window dimensions for display size
		this.chatCanvas.style.width = this.containerElement.clientWidth + 'px';
		this.chatCanvas.style.height = this.containerElement.clientHeight + 'px';

		// Update the canvas logical size to match the container aspect ratio
		// Set a reasonable limit for canvas width to prevent performance issues
		const containerAspect = this.containerElement.clientWidth / this.containerElement.clientHeight;
		const newWidth = Math.min(800, Math.floor(containerAspect * 200));

		// Only update if changed to avoid resetting the canvas
		if (this.chatCanvas.width !== newWidth) {
			this.chatCanvas.width = newWidth;
			this.chatCanvas.height = 200; // Keep height consistent at 200px for scaling
			this.oldScreenWidth = newWidth;
			this.screenWidth = newWidth;
		}
	}

	private renderChatMessages() {
		const ctx = this.chatCtx;
		ctx.globalAlpha = SettingsManager.settings.chatOpacity;
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
		ctx.globalAlpha = 1;
	}

	private renderPixelText(text: string, x: number, y: number, defaultColor: string) {
		if (!text) return;

		let currentX = x;
		let currentColor = defaultColor;
		let currentSegment = '';

		const renderSegment = (segment: string, color: string) => {
			if (!segment) return;

			if (SettingsManager.settings.doPrettyText) {
				// Pretty rendering logic
				this.offscreenCtx.font = '8px Tiny5';
				const textMetrics = this.offscreenCtx.measureText(segment);
				const textWidth = Math.max(Math.ceil(textMetrics.width), 1);
				const textHeight = 8;

				if (this.offscreenCanvas.width !== textWidth || this.offscreenCanvas.height !== textHeight) {
					this.offscreenCanvas.width = textWidth;
					this.offscreenCanvas.height = textHeight;
				}

				this.offscreenCtx.clearRect(0, 0, textWidth, textHeight);
				this.offscreenCtx.font = '8px Tiny5';
				this.offscreenCtx.fillStyle = color;
				this.offscreenCtx.fillText(segment, 0, textHeight - 1);

				const imageData = this.offscreenCtx.getImageData(0, 0, textWidth, textHeight);
				const data = imageData.data;

				for (let i = 0; i < data.length; i += 4) {
					data[i + 3] = data[i + 3] > 170 ? 255 : 0;
				}

				this.offscreenCtx.putImageData(imageData, 0, 0);
				this.chatCtx.drawImage(this.offscreenCanvas, currentX, y - textHeight + 1);
				currentX += textWidth;
			} else {
				// Ugly rendering logic
				this.chatCtx.font = '8px Tiny5';
				this.chatCtx.fillStyle = color;
				this.chatCtx.fillText(segment, currentX, y);
				currentX += this.chatCtx.measureText(segment).width;
			}
		};

		for (let i = 0; i < text.length; i++) {
			// Check for color codes
			if (text[i] === '&' && i + 1 < text.length && this.getColorCode(text[i + 1])) {
				renderSegment(currentSegment, currentColor);
				currentSegment = '';
				currentColor = <string> this.getColorCode(text[i + 1]);
				i++; // Skip the color code character
			} // Check for sprite codes
			else if (text[i] === '^' && i + 1 < text.length && ChatOverlay.SPRITE_CODES[text[i + 1]]) {
				renderSegment(currentSegment, currentColor);
				currentSegment = '';

				const spriteName = ChatOverlay.SPRITE_CODES[text[i + 1]];
				this.spriteManager.renderSprite(
					this.chatCtx,
					spriteName,
					currentX,
					y - 7, // Adjust y to align with text baseline
					// 8, // Width of the sprite
					// 8, // Height of the sprite
				);
				currentX += 8; // Move cursor forward by sprite width
				i++; // Skip the sprite code character
			} // Handle regular characters
			else {
				currentSegment += text[i];
			}
		}

		renderSegment(currentSegment, currentColor);
	}

	private renderDebugText() {
		const ctx = this.chatCtx;
		ctx.font = '8px Tiny5';
		ctx.fillStyle = 'teal';

		const linesToRender = [];
		const framerate = this.renderer.getFramerate();

		if (this.localPlayer.latency >= 999) {
			linesToRender.push('&cdisconnected :(');
		}
		let latencyColor = '';
		if (this.localPlayer.latency > 60) latencyColor = '&6';
		if (this.localPlayer.latency > 200) latencyColor = '&c';

		linesToRender.push(
			'candiru ' + this.localPlayer.gameVersion + ' @ ' + Math.round(framerate) + 'fps, ' + latencyColor +
				Math.round(this.localPlayer.latency) + 'ms',
		);

		//const playerX = Math.round(this.localPlayer.position.x);
		if (SettingsManager.settings.developerMode) {
			linesToRender.push(
				'pos:' + this.localPlayer.position.x.toFixed(2) + ',' + this.localPlayer.position.y.toFixed(2) + ',' +
					this.localPlayer.position.z.toFixed(2),
			);
			linesToRender.push(
				this.networking.getServerInfo().name + ' (' + this.networking.getServerInfo().currentPlayers + '/' +
					this.networking.getServerInfo().maxPlayers + ')',
				this.networking.getServerInfo().url,
			);
			linesToRender.push(
				'map: ' + this.networking.getServerInfo().mapName + ', mode: ' + this.networking.getServerInfo().gameMode +
					', v' +
					this.networking.getServerInfo().version,
			);

			linesToRender.push('tps: ' + this.networking.getServerInfo().tickRate);

			linesToRender.push(`health: ${this.localPlayer.health} / ${this.networking.getServerInfo().playerMaxHealth}`);

			const tickTimeMs = this.networking.getServerInfo().tickComputeTime * 1000;
			const cleanupTimeMs = this.networking.getServerInfo().cleanupComputeTime * 1000;
			const tickSpeedMs = 1 / this.networking.getServerInfo().tickRate * 1000;
			const tickTimePercent = (tickTimeMs / tickSpeedMs) * 100;

			linesToRender.push(
				'tickTime: ' + tickTimeMs.toFixed(2) + '/' + tickSpeedMs.toFixed(2) + 'ms (' + tickTimePercent.toFixed(2) +
					'%)',
			);
			linesToRender.push('cleanupTime: ' + cleanupTimeMs.toFixed(2) + 'ms');
			linesToRender.push(
				'mem (mib): rss:' + this.networking.getServerInfo().memUsageRss.toFixed(2) + ', heapTotal:' +
					this.networking.getServerInfo().memUsageHeapTotal.toFixed(2) + ', heapUsed: ' +
					this.networking.getServerInfo().memUsageHeapUsed.toFixed(2) + ', external: ' +
					this.networking.getServerInfo().memUsageExternal.toFixed(2),
			);
			linesToRender.push('propCount: ' + this.networking.getPropData().length);
		}
		if (this.localPlayer.gameMsgs2) {
			for (const msg of this.localPlayer.gameMsgs2) {
				linesToRender.push(msg);
			}
		}

		// Append profiler stats if enabled
		if (SettingsManager.settings.profilerMode && this.profiler?.avg) {
			const entries = Object.entries(this.profiler.avg) as [string, number][]; // preserve insertion order
			const total = entries.reduce((s, [, v]) => s + v, 0);
			linesToRender.push('&e--- profiler (avg ms over 200f) ---');
			for (const [name, dt] of entries) {
				linesToRender.push(
					`${name}: ${dt.toFixed(2)} (${((dt / total) * 100).toFixed(1)}%)`,
				);
			}
			linesToRender.push(`total: ${total.toFixed(2)} ms`);
		}

		for (let i = 0; i < linesToRender.length; i++) {
			this.renderPixelText(linesToRender[i], 2, 7 + 7 * i, 'teal');
		}

		this.debugTextHeight = 7 * linesToRender.length;
	}

	private detectGameMessagesChanges(now: number) {
		const current = this.gameMessages;
		if (!current) return;

		for (let i = 0; i < this.maxMessagesOnScreen; i++) {
			const line = this.lines[i];
			if (!line) continue; // Skip this iteration

			const currentMessage = current[i] || '';

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
	}

	private updateAnimatedGameMessages(now: number) {
		for (let i = 0; i < this.maxMessagesOnScreen; i++) {
			const line = this.lines[i];
			if (!line || !line.currentMessage) continue; // Early return if null

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

	private updateAnimatedEventMessages(now: number) {
		for (let i = this.eventMessages.length - 1; i >= 0; i--) {
			const eventMessage = this.eventMessages[i];
			const elapsed = now - eventMessage.timestamp;

			// Check for lifetime expiration
			if (eventMessage.state === 'idle' && elapsed > eventMessage.lifetime) {
				eventMessage.state = 'animatingOut';
				eventMessage.timestamp = now; // Reset timestamp for animation
			}

			const animationDuration = eventMessage.message.length / this.eventAnimationCharsPerSecond;
			const progress = Math.min((now - eventMessage.timestamp) / animationDuration, 1);
			eventMessage.animationProgress = progress;

			if (eventMessage.state === 'animatingOut' && progress >= 1) {
				this.eventMessages.splice(i, 1);
				continue;
			}

			if (eventMessage.state === 'animatingIn' && progress >= 1) {
				eventMessage.state = 'idle';
				eventMessage.animationProgress = 1;
			}
		}
	}

	private renderGameText() {
		const ctx = this.chatCtx;
		ctx.font = '8px Tiny5';
		const centerY = this.chatCanvas.height / 2 + 48;

		for (let i = 0; i < this.maxMessagesOnScreen; i++) {
			const line = this.lines[i];
			if (!line || !line.currentMessage) continue;

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

	private renderEventMessages() {
		const ctx = this.chatCtx;
		ctx.globalAlpha = SettingsManager.settings.chatOpacity;
		ctx.font = '8px Tiny5';
		const startY = 7;

		for (let i = 0; i < this.eventMessages.length; i++) {
			const eventMessage = this.eventMessages[i];
			let visibleText = eventMessage.message;

			if (eventMessage.state === 'animatingIn' || eventMessage.state === 'animatingOut') {
				visibleText = this.getVisibleText(
					eventMessage.message,
					eventMessage.state,
					eventMessage.animationProgress,
				);
			}

			const textWidth = this.getRenderedTextWidth(visibleText);
			const x = this.screenWidth - textWidth - 1;
			const y = startY + i * 7;

			this.renderPixelText(visibleText, x, y, 'white');
		}
		ctx.globalAlpha = 1;
	}

	private getRenderedTextWidth(text: string): number {
		let totalWidth = 0;
		let currentSegment = '';
		const ctx = this.chatCtx;

		for (let i = 0; i < text.length; i++) {
			// Handle color codes
			if (text[i] === '&' && i + 1 < text.length && this.getColorCode(text[i + 1])) {
				if (currentSegment) {
					totalWidth += ctx.measureText(currentSegment).width;
					currentSegment = '';
				}
				i++; // skip color code
			} // Handle sprite codes
			else if (text[i] === '^' && i + 1 < text.length && ChatOverlay.SPRITE_CODES[text[i + 1]]) {
				if (currentSegment) {
					totalWidth += ctx.measureText(currentSegment).width;
					currentSegment = '';
				}
				totalWidth += 8; // fallback
				i++; // skip sprite code
			} // Normal text
			else {
				currentSegment += text[i];
			}
		}

		// Add any remaining text
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
		for (let i = 0; i < 4; i++) y -= squareHeight + 4;
		this.drawButton(x, y, squareWidth, squareHeight, cornerRadius, '...', 1, -3);
		// y += squareHeight + 4;
		// this.drawButton(x, y, squareWidth, squareHeight, cornerRadius, ':O', 1, 3);
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

		return size * scaleFactor * this.renderer.targetZoom;
	}

	// private sparkleParticles: {
	// 	basePos: THREE.Vector3;
	// 	offset: THREE.Vector3;
	// 	speed: number;
	// 	phase: number;
	// 	radius: number;
	// }[] = [];
	//
	// private readonly SPARKLE_COUNT = 6;
	// private readonly SPARKLE_RADIUS = 0.5; // World units instead of screen pixels

	// public renderSparkles() {
	// 	const positions = this.localPlayer.highlightedVectors.slice(0);
	// 	//const positions = [new THREE.Vector3(0, 3 + Math.sin(Date.now() / 1000), 0)];
	//
	// 	// Initialize or update sparkle particles
	// 	while (this.sparkleParticles.length < positions.length * this.SPARKLE_COUNT) {
	// 		this.sparkleParticles.push({
	// 			basePos: new THREE.Vector3(),
	// 			offset: new THREE.Vector3(
	// 				Math.random() * 2 - 1,
	// 				Math.random() * 2 - 1,
	// 				Math.random() * 2 - 1,
	// 			).normalize(),
	// 			speed: 0.5 + Math.random() * 1.5,
	// 			phase: Math.random() * Math.PI * 2,
	// 			radius: this.SPARKLE_RADIUS * (0.5 + Math.random() * 0.5),
	// 		});
	// 	}
	//
	// 	// Remove excess particles
	// 	while (this.sparkleParticles.length > positions.length * this.SPARKLE_COUNT) {
	// 		this.sparkleParticles.pop();
	// 	}
	//
	// 	const ctx = this.chatCtx;
	// 	ctx.fillStyle = 'rgba(46,163,46,0.8)';
	// 	const time = Date.now() / 1000;
	//
	// 	// Update and render each sparkle
	// 	for (let i = 0; i < positions.length; i++) {
	// 		const basePos = positions[i];
	//
	// 		// Update and draw sparkles for this position
	// 		for (let j = 0; j < this.SPARKLE_COUNT; j++) {
	// 			const particle = this.sparkleParticles[i * this.SPARKLE_COUNT + j];
	// 			particle.basePos.copy(basePos);
	//
	// 			// Calculate 3D orbital motion
	// 			const angle = particle.phase + time * particle.speed;
	// 			const wobble = Math.sin(time * 3 + particle.phase) * 0.3;
	//
	// 			// Create orbital motion around the base position
	// 			const orbitPos = new THREE.Vector3().copy(particle.offset)
	// 				.multiplyScalar(particle.radius * (1 + wobble))
	// 				.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
	// 				.add(particle.basePos);
	//
	// 			// Project to screen space
	// 			const projected = this.getProjected3D(orbitPos);
	//
	// 			// Skip if behind camera
	// 			if (orbitPos.clone().project(this.renderer.getCamera()).z >= 1) continue;
	//
	// 			// Calculate size based on distance to camera
	// 			const distance = orbitPos.distanceTo(this.renderer.getCamera().position);
	// 			const size = Math.max(1, Math.min(3, this.getSize(distance) * 0.5));
	//
	// 			// Draw particle
	// 			ctx.fillRect(
	// 				Math.round(projected.x - size / 2),
	// 				Math.round(projected.y - size / 2),
	// 				Math.ceil(size),
	// 				Math.ceil(size),
	// 			);
	// 		}
	// 	}
	// }

	public sniperOverlayEnabled: boolean = false;
	public sniperOverlayPower: number = 0;

	public renderSniperOverlay() {
		if (!this.sniperOverlayEnabled) return;

		const ctx = this.chatCtx;
		const centerX = Math.floor(this.chatCanvas.width / 2);
		const radius = 65;
		const circleY = 100;

		//				ctx.fillRect(Math.floor(this.screenWidth / 2), 100, 1, 1);
		// 				ctx.fillRect(Math.floor(this.screenWidth / 2), 95, 1, 3);
		// 				ctx.fillRect(Math.floor(this.screenWidth / 2), 103, 1, 3);
		// 				ctx.fillRect(Math.floor(this.screenWidth / 2 + 3), 100, 3, 1);
		// 				ctx.fillRect(Math.floor(this.screenWidth / 2 - 5), 100, 3, 1);

		// METHOD 2: Using compositing
		// First draw the overlay
		ctx.fillStyle = 'rgba(4, 25, 4, 0.7)';
		ctx.fillRect(0, 0, this.chatCanvas.width, this.chatCanvas.height);

		// Then punch a hole in it
		ctx.globalCompositeOperation = 'destination-out';
		ctx.beginPath();
		ctx.arc(centerX, circleY, radius, 0, Math.PI * 2);
		ctx.fill();

		// Restore normal compositing
		ctx.globalCompositeOperation = 'source-over';

		//this.renderPixelText(this.sniperOverlayPower.toFixed(1), centerX + 3, circleY + 3, 'green');
		// const barColors = ['green', 'green', 'yellow', 'yellow', 'orange', 'orange', 'red'];
		// for (let i = 0; i < barColors.length; i++) {
		// 	if (this.sniperOverlayPower >= (i + 1) / barColors.length) ctx.fillStyle = barColors[i];
		// 	else ctx.fillStyle = 'gray';
		// 	ctx.fillRect(centerX + 7 + i, circleY - i, 1, i + 1);
		// }

		//extend crosshair to radius
		//ctx.fillStyle = SettingsManager.settings.crosshairColor;
		//ctx.globalAlpha = 0.3;

		for (let i = 0; i < radius / 5; i++) {
			let positiveLength = 3;
			if (radius / 5 - i < 2) positiveLength = 2; //crosshair bleeds one pixel out of the circle
			ctx.fillRect(Math.floor(this.screenWidth / 2 + 3 + i * 5), 100, positiveLength, 1);
			ctx.fillRect(Math.floor(this.screenWidth / 2), 100 + 3 + i * 5, 1, positiveLength);

			ctx.fillRect(Math.floor(this.screenWidth / 2 - 5 - i * 5), 100, 3, 1);
			ctx.fillRect(Math.floor(this.screenWidth / 2), 100 - 5 - i * 5, 1, 3);
		}
		ctx.globalAlpha = 1;

		const headshotIsDeadly = this.sniperOverlayPower > 1 / (1.0 * 7); //0.99 damage, 7x multiplier
		const bodyShotIsDeadly = this.sniperOverlayPower >= 1;
		if (headshotIsDeadly) {
			ctx.fillStyle = 'rgba(255,0,0,0.5)';
			//ctx.fillRect(centerX + 16 + 8, circleY + 4, 4, 4);
			const now = Date.now() / 1000;
			const flashOn = now % 0.1 < 0.05 || bodyShotIsDeadly;

			let offsetX = 0;
			let offsetY = 0;
			if (bodyShotIsDeadly) {
				offsetX = Math.round((Math.random() - 0.5) * 1.02);
				offsetY = Math.round((Math.random() - 0.5) * 1.02);
			}

			if (flashOn) {
				this.spriteManager.renderSprite(ctx, 'redguy_6px', centerX + 16 + 8 - 3 + offsetX, circleY + 2 + offsetY);
			}
		}
		const barCount = 16;
		for (let i = 0; i < barCount; i++) {
			if (this.sniperOverlayPower >= (i + 1) / barCount) {
				ctx.fillStyle = `hsl(${120 - (i / barCount) * 120}, 100%, 50%)`;
			} else ctx.fillStyle = 'gray';
			const h = Math.floor(i / 2);
			ctx.fillRect(centerX + 16 + i, circleY - 2 - h, 1, h + 1);
		}
	}

	// Renders a slim vertical durability bar on the right side of the screen
	// Uses a green (full) to red (empty) gradient similar in style to the sniper charge colors
	private renderDurabilityBar() {
		const player = this.networking.getLocalPlayer();
		if (!player || !player.inventory || player.inventory.length === 0) return;
		const idx = Math.max(0, Math.min(player.heldItemIndex ?? 0, player.inventory.length - 1));
		const item = player.inventory[idx] as { durability?: number } | undefined;
		if (!item || item.durability === undefined || item.durability === null) return;

		// Normalize durability to 0..1 (older data may be 0..100)
		let d = Number(item.durability);
		if (!Number.isFinite(d)) return;
		if (d > 1.0001 && d <= 100) d = d / 100; // best-effort normalization
		d = Math.max(0, Math.min(1, d));

		// Geometry and animated horizontal offset (slide away when inventory is shown)
		const ctx = this.chatCtx;
		const margin = 4;
		const barWidth = 4; // thinner

		// Determine how wide the inventory viewport is in canvas pixels so we can slide past it
		let targetOffset = 0;
		if (this.renderer?.isInventoryVisible?.()) {
			// Renderer sets viewport using real screen pixels; chatCanvas is scaled to 200px height
			// Convert inventory width (game pixels -> screen pixels -> canvas pixels)
			// Inventory width in game pixels
			const inventoryWidthGamePx = 20;
			// Renderer maps 200 game px height to full screen height, so screenPixelsPerGamePx = screenHeight/200
			const screenPixelsPerGamePx = this.renderer.getScreenPixelsInGamePixel();
			// chatCanvas is sized to 200 logical pixels tall, so canvasPixelsPerScreenPx = 200 / screenHeight
			// Combine to get canvas pixel width of the inventory pane
			const inventoryWidthCanvasPx = inventoryWidthGamePx; // simplifies to 1:1 since height normalization gives 200
			// Add the 4px padding the renderer uses before scissor (converted to canvas px)
			const paddingCanvasPx = 4 / screenPixelsPerGamePx; // 4 screen px -> canvas px
			targetOffset = Math.ceil(inventoryWidthCanvasPx + paddingCanvasPx);
		}

		// Smoothly approach the target offset for a nice slide animation
		const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
		this.durabilityBarOffset = lerp(this.durabilityBarOffset, targetOffset, 0.2);

		const barX = this.chatCanvas.width - barWidth - margin - this.durabilityBarOffset;
		// Make the bar shorter and vertically centered
		const desiredHeight = Math.max(24, Math.round(this.chatCanvas.height * 0.4)); // ~40% of screen height
		const barHeight = desiredHeight;
		const barTop = Math.floor((this.chatCanvas.height - barHeight) / 2);
		const barBottom = barTop + barHeight;
		const filledHeight = Math.round(barHeight * d);

		ctx.save();
		// Draw at ~50% opacity overall
		ctx.globalAlpha = 0.5;

		// Background track
		ctx.fillStyle = 'rgba(0,0,0,0.35)';
		ctx.fillRect(barX - 1, barTop - 1, barWidth + 2, barHeight + 2); // subtle shadow/border
		ctx.fillStyle = 'rgba(20,20,20,0.6)';
		ctx.fillRect(barX, barTop, barWidth, barHeight);

		if (filledHeight <= 0) return;

		// Gradient from green (top) to red (bottom)
		const grad = ctx.createLinearGradient(0, barTop, 0, barBottom);
		grad.addColorStop(0, 'hsl(120, 100%, 50%)'); // green at top
		grad.addColorStop(1, 'hsl(0, 100%, 50%)'); // red at bottom

		ctx.save();
		// Clip to the filled portion (grow from bottom)
		ctx.beginPath();
		ctx.rect(barX, barBottom - filledHeight, barWidth, filledHeight);
		ctx.clip();

		ctx.fillStyle = grad;
		ctx.fillRect(barX, barTop, barWidth, barHeight);
		ctx.restore();

		ctx.restore();

		// // Optional tick marks for readability
		// ctx.fillStyle = 'rgba(0,0,0,0.35)';
		// for (let i = 1; i < 5; i++) {
		// 	const y = Math.round(barTop + (barHeight * i) / 5);
		// 	ctx.fillRect(barX, y, barWidth, 1);
		// }
	}

	private hitMarkersNow: {
		hitPoint: THREE.Vector3;
		shotVector: THREE.Vector3;
		timestamp: number;
		type: 'player' | 'prop';
	}[] = [];
	private minTimeBetweenHitMarkers = 0.016;
	private lastHitMarkerTime = 0;

	public renderHitMarkers() {
		const currentTime = Date.now() / 1000;
		const elapsed = currentTime - this.lastHitMarkerTime;

		if (this.renderer.hitMarkerQueue.length > 0 && elapsed >= this.minTimeBetweenHitMarkers) {
			// Always process 1/10 of the queue, but at least one
			const processCount = Math.max(Math.floor(this.renderer.hitMarkerQueue.length / 2), 1);

			this.lastHitMarkerTime = currentTime;

			// Process the calculated number of markers
			for (let i = 0; i < processCount; i++) {
				const hitMarkerToAdd = this.renderer.hitMarkerQueue.shift();
				if (hitMarkerToAdd) {
					hitMarkerToAdd.timestamp = currentTime;
					this.hitMarkersNow.push(hitMarkerToAdd);
				}
			}
		}

		//
		// console.log('hitMarkersNow', this.hitMarkersNow);
		// console.log('hitMarkerQueue', this.renderer.hitMarkerQueue);

		for (let i = this.hitMarkersNow.length - 1; i >= 0; i--) {
			if (this.hitMarkersNow[i].timestamp === -1) {
				this.hitMarkersNow[i].timestamp = Date.now() / 1000;
			}

			const timeSinceHit = Date.now() / 1000 - this.hitMarkersNow[i].timestamp;
			const lifePercent = timeSinceHit / hitMarkerLifetime;

			if (timeSinceHit > hitMarkerLifetime) {
				this.hitMarkersNow.splice(i, 1);
				continue;
			}

			const hitVec = this.hitMarkersNow[i].hitPoint;
			const projected = this.getProjected3D(hitVec);

			if (hitVec.clone().project(this.renderer.getCamera()).z < 1) {
				if (this.hitMarkersNow[i].type === 'player') {
					this.chatCtx.fillStyle = 'rgba(255,0,0,' + (1 - Math.pow(lifePercent, 1.25)) + ')';
				} else {
					this.chatCtx.fillStyle = 'rgba(230,230,230,' + (1 - Math.pow(lifePercent, 1.25)) + ')';
				}

				const sizeMultiplier = this.getSize(this.hitMarkersNow[i].shotVector.length());
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

		linesToRender.push(playerData.length + '/' + this.networking.getServerInfo().maxPlayers + ' online');
		colorsToRender.push('white');
		for (let i = 0; i < playerData.length; i++) {
			linesToRender.push(playerData[i].name);
			if (playerData[i].latency > 200) {
				colorsToRender.push('red');
			} else if (playerData[i].latency > 60) {
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
		if (
			Date.now() / 1000 - this.networking.getDamagedTimestamp() < 0.07
		) {
			ctx.fillStyle = 'rgba(255,0,0,0.1)';
			ctx.fillRect(0, 0, this.chatCanvas.width, this.chatCanvas.height);

			if (Date.now() / 1000 - this.networking.severelyDamagedTimestamp < 0.07) {
				ctx.globalAlpha = 0.2;
				this.spriteManager.renderSprite(ctx, 'redguy', 0, 0, this.chatCanvas.width, this.chatCanvas.height);

				ctx.globalAlpha = 1;
			}
		}
	}

	private renderCrosshair() {
		const ctx = this.chatCtx;
		ctx.fillStyle = SettingsManager.settings.crosshairColor;
		if (ChatOverlay.isHexColor(SettingsManager.settings.crosshairColor)) {
			ctx.fillStyle = SettingsManager.settings.crosshairColor +
				ChatOverlay.toTwoDigitHex(SettingsManager.settings.crosshairOpacity);
		}

		if (this.renderer.crosshairIsFlashing) {
			ctx.fillStyle = '#FF0000';
		}
		switch (SettingsManager.settings.crosshairType) {
			case 0:
				ctx.fillRect(Math.floor(this.screenWidth / 2), 100 - 3, 1, 7);
				//ctx.fillRect(Math.floor(this.screenWidth / 2 - 3), 100, 7, 1);
				ctx.fillRect(Math.floor(this.screenWidth / 2 - 3), 100, 3, 1);
				ctx.fillRect(Math.floor(this.screenWidth / 2 + 1), 100, 3, 1);

				break;
			case 1:
				ctx.fillRect(Math.floor(this.screenWidth / 2), 100, 1, 1);
				break;
			case 2:
				ctx.fillRect(Math.floor(this.screenWidth / 2), 100, 1, 1);
				ctx.fillRect(Math.floor(this.screenWidth / 2), 95, 1, 3);
				ctx.fillRect(Math.floor(this.screenWidth / 2), 103, 1, 3);
				ctx.fillRect(Math.floor(this.screenWidth / 2 + 3), 100, 3, 1);
				ctx.fillRect(Math.floor(this.screenWidth / 2 - 5), 100, 3, 1);

				break;
			case 3:
				break;
		}
	}

	public static isHexColor(str: string) {
		const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
		return hexColorRegex.test(str);
	}

	public static toTwoDigitHex(value: number) {
		if (value < 0) value = 0;
		if (value > 1) value = 1;

		const scaledValue = Math.round(value * 255);
		return scaledValue.toString(16).padStart(2, '0');
	}

	private onKeyDown(e: KeyboardEvent) {
		if (this.gameIndex !== Game.nextGameIndex - 1) return;

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

		if (e.key.toLowerCase() === 't' && !this.nameSettingActive && !Game.menuOpen) {
			//if (this.localPlayer.name.length > 0)
			this.localPlayer.chatActive = true;
			//else this.nameSettingActive = true;
		}

		if (e.key === '/' && !this.nameSettingActive && !this.localPlayer.chatActive && !Game.menuOpen) {
			//if (this.localPlayer.name.length > 0) {
			this.localPlayer.chatActive = true;
			this.localPlayer.chatMsg = '/';
			//} else this.nameSettingActive = true;
		}

		if (e.key.toLowerCase() === 'n' && !this.localPlayer.chatActive && !Game.menuOpen) {
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

	public addEventMessage(message: string) {
		const now = Date.now() / 1000;
		const eventMessage: AnimatedEventMessage = {
			id: this.generateUniqueId(),
			message: message,
			state: 'animatingIn',
			animationProgress: 0,
			timestamp: now,
			lifetime: this.eventMessageLifetime,
		};

		this.eventMessages.unshift(eventMessage);

		if (this.eventMessages.length > this.maxEventMessages) {
			for (let i = this.eventMessages.length - 1; i >= this.maxEventMessages; i--) {
				const oldMessage = this.eventMessages[i];
				if (oldMessage.state === 'idle') {
					oldMessage.state = 'animatingOut';
					oldMessage.timestamp = now;
				}
			}
		}
	}

	private clearOldMessages() {
		for (let i = 0; i < this.chatMessages.length; i++) {
			if (Date.now() / 1000 - this.chatMessages[i].timestamp > this.chatMessageLifespan + 5) {
				this.chatMessages.splice(i, 1);
			}
		}

		for (let i = this.chatMessages.length - 1; i >= 0; i--) {
			if (i < this.chatMessages.length - SettingsManager.settings.chatMaxLines) {
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

	// Public method to trigger a resize
	public triggerResize() {
		this.onWindowResize();
	}
}

// Extend ChatOverlay with profiler structure (attached dynamically by Game)
export interface ChatOverlay {
	profiler?: {
		frame: number;
		accum: { [k: string]: number };
		avg: { [k: string]: number };
	};
}
