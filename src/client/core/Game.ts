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
	private static nextGameIndex: number = 0;
	public static menuOpen: boolean = false;

	constructor(container: HTMLElement) {
		this.gameIndex = Game.nextGameIndex++;
		this.localPlayer = new Player();
		this.localPlayer.name = SettingsManager.settings.name ?? this.localPlayer.name;
		this.chatOverlay = new ChatOverlay(container, this.localPlayer);
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
		this.collisionManager = new CollisionManager(this.inputHandler);
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
		this.inputHandler.handleInputs();
		this.touchInputHandler.onFrame();
		this.collisionManager.collisionPeriodic(this.localPlayer);
		this.networking.updatePlayerData();
		this.chatOverlay.onFrame();
		this.inventoryManager.onFrame();
		this.shotHandler.onFrame();
		this.renderer.onFrame(this.localPlayer);
		if (this.networking.getServerInfo().mapName) {
			this.mapLoader.load('/maps/' + this.networking.getServerInfo().mapName + '/map.glb');
		}
		this.remoteItemRenderer.onFrame();
		requestAnimationFrame(this.animate.bind(this));
	}

	start() {
		this.init();
		this.animate();
	}

	setMenuOpen(isMenuOpen: boolean) {
		Game.menuOpen = isMenuOpen;
	}
}
