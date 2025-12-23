import { Renderer } from './Renderer.ts';
import { ChatOverlay } from '../ui/ChatOverlay.ts';
import { InputHandler } from '../input/InputHandler.ts';
import { Networking } from './Networking.ts';
import { CollisionManager } from '../input/CollisionManager.ts';
import { Inventory } from './Inventory.ts';
import { HealthIndicator } from '../ui/HealthIndicator.ts';
import { MapLoader } from './MapLoader.ts';
import { RemoteItemRenderer } from './RemoteItemRenderer.ts';
import { TouchInputHandler } from '../input/TouchInputHandler.ts';
import { SettingsManager } from './SettingsManager.ts';
import { Player } from '../../shared/Player.ts';
import { ShotHandler } from './ShotHandler.ts';
import * as THREE from 'three';

export class Game {
	private localPlayer: Player;
	private renderer: Renderer;
	private chatOverlay: ChatOverlay;
	private inputHandler: InputHandler;
	private touchInputHandler: TouchInputHandler;
	public networking: Networking;
	private collisionManager: CollisionManager;
	private shotHandler: ShotHandler;
	private inventoryManager: Inventory;
	private mapLoader: MapLoader;
	private healthIndicator: HealthIndicator;
	private remoteItemRenderer: RemoteItemRenderer;
	private gameIndex: number;
	public static nextGameIndex: number = 0;
	public static menuOpen: boolean = false;
	private clock: THREE.Clock = new THREE.Clock();

	public stopped: boolean = false;

	constructor(container: HTMLElement) {
		this.gameIndex = Game.nextGameIndex++;
		this.localPlayer = new Player();
		this.localPlayer.name = SettingsManager.settings.name ?? this.localPlayer.name;
		this.chatOverlay = new ChatOverlay(container, this.localPlayer, this.gameIndex);
		this.networking = new Networking(this.localPlayer, this.chatOverlay);

		// Create Renderer first
		this.renderer = new Renderer(container, this.networking, this.localPlayer, this.chatOverlay);

		// Then create ShotHandler, passing the renderer
		this.shotHandler = new ShotHandler(this.renderer, this.networking);

		// Now set the shotHandler in the renderer
		this.renderer.setShotHandler(this.shotHandler);

		this.chatOverlay.setRenderer(this.renderer);
		this.inputHandler = new InputHandler(this.renderer, this.localPlayer, this.gameIndex);
		this.touchInputHandler = new TouchInputHandler(this.inputHandler, this.chatOverlay);
		this.renderer.setInputHandler(this.inputHandler);
		this.collisionManager = new CollisionManager(this.inputHandler, this.networking);
		this.renderer.setCollisionManager(this.collisionManager);
		this.inventoryManager = new Inventory(
			this.shotHandler,
			this.renderer,
			this.inputHandler,
			this.networking,
			this.localPlayer,
		);
		this.chatOverlay.setNetworking(this.networking);
		this.chatOverlay.setInputHandler(this.inputHandler);
		this.mapLoader = new MapLoader(this.renderer);
		this.healthIndicator = new HealthIndicator(this.renderer, this.localPlayer, this.networking);
		this.remoteItemRenderer = new RemoteItemRenderer(this.networking, this.renderer, this.shotHandler);
	}

	init() {
		this.inventoryManager.init();
		this.healthIndicator.init();
	}

	animate() {
		if (this.stopped) return;
		const deltaTime = Math.min(this.clock.getDelta(), 1 / 5);

		// Basic frame profiler when enabled
		const profilerEnabled = SettingsManager.settings.profilerMode;
		let t0: number | undefined;
		const marks: { name: string; dt: number }[] = [];
		const mark = (name: string) => {
			if (!profilerEnabled) return;
			const now = performance.now();
			if (t0 != null) {
				marks.push({ name, dt: now - t0 });
			}
			t0 = now;
		};
		if (profilerEnabled) t0 = performance.now();
		this.inputHandler.handleInputs();
		mark('inputs');
		this.touchInputHandler.onFrame();
		mark('touch');
		this.collisionManager.collisionPeriodic(this.localPlayer);
		mark('collision');
		this.networking.updatePlayerData();
		mark('netUpdate');
		this.chatOverlay.onFrame(deltaTime);
		mark('chat');
		this.inventoryManager.onFrame();
		mark('inventory');
		this.shotHandler.onFrame();
		mark('shots');
		this.renderer.onFrame(this.localPlayer, deltaTime);
		mark('render');
		if (this.networking.getServerInfo().mapName) {
			this.mapLoader.load('/maps/' + this.networking.getServerInfo().mapName + '/map.glb');
		}
		mark('mapLoad');
		this.remoteItemRenderer.onFrame();
		mark('remoteItems');
		if (profilerEnabled && marks.length) {
			// Expose rolling averages via chatOverlay
			if (!this.chatOverlay.profiler) {
				this.chatOverlay.profiler = { frame: 0, accum: {}, avg: {} };
			}
			const pf = this.chatOverlay.profiler!; // profiler object guaranteed after initialization above
			pf.frame++;
			for (const m of marks) {
				pf.accum[m.name] = (pf.accum[m.name] || 0) + m.dt;
			}
			const sampleWindow = 200;
			if (pf.frame % sampleWindow === 0) {
				pf.avg = {};
				for (const k in pf.accum) {
					pf.avg[k] = pf.accum[k] / sampleWindow;
				}
				pf.accum = {};
			}
		}
		requestAnimationFrame(this.animate.bind(this));
	}

	start() {
		this.init();
		this.animate();
	}

	destroy() {
		this.stopped = true;
		this.chatOverlay.destroy();
		this.inputHandler.destroy();
		this.touchInputHandler.destroy();
		this.renderer.destroy();
		this.inventoryManager.destroy();
		this.mapLoader.destroy();
		this.healthIndicator.destroy();
		this.remoteItemRenderer.destroy();
		this.networking.destroy();
	}

	setMenuOpen(isMenuOpen: boolean) {
		Game.menuOpen = isMenuOpen;
	}

	// Method to trigger renderer resize
	public resizeRenderer() {
		this.renderer.triggerResize();
		this.chatOverlay.triggerResize();
	}
}
