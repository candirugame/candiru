import {Player} from './Player.ts';
import {Renderer} from './Renderer.ts';
import {ChatOverlay} from '../ui/ChatOverlay.ts';
import {InputHandler} from '../input/InputHandler.ts';
import {Networking} from './Networking.ts';
import {CollisionManager} from '../input/CollisionManager.ts';
import {Inventory} from './Inventory.ts';
import {HealthIndicator} from '../ui/HealthIndicator.ts';
import {MapLoader} from './MapLoader.ts';
import {RemoteItemRenderer} from "./RemoteItemRenderer.ts";

export class Game {
    private localPlayer: Player;
    private renderer: Renderer;
    private chatOverlay: ChatOverlay;
    private inputHandler: InputHandler;
    private networking: Networking;
    private collisionManager: CollisionManager;
    private inventoryManager: Inventory;
    private map: MapLoader;
    private healthIndicator: HealthIndicator;
    private remoteItemRenderer: RemoteItemRenderer;
    private id: number;
    private static nextId: number = 0;


    constructor() {
        this.id = Game.nextId++;
        this.localPlayer = new Player();
        this.chatOverlay = new ChatOverlay(this.localPlayer);
        this.networking = new Networking(this.localPlayer, this.chatOverlay);
        this.renderer = new Renderer(this.networking, this.localPlayer, this.chatOverlay);
        this.chatOverlay.setRenderer(this.renderer);
        this.inputHandler = new InputHandler(this.renderer, this.localPlayer, this.id);
        this.collisionManager = new CollisionManager(this.renderer, this.inputHandler);
        this.inventoryManager = new Inventory(this.renderer, this.inputHandler, this.networking, this.localPlayer);
        this.chatOverlay.setNetworking(this.networking);
        this.chatOverlay.setInputHandler(this.inputHandler);
        this.map = new MapLoader('maps/realmap1.glb', this.renderer, this.collisionManager);
        this.healthIndicator = new HealthIndicator(this.renderer,this.localPlayer);
        this.remoteItemRenderer = new RemoteItemRenderer(this.networking, this.renderer);
    }

    init() {
        this.collisionManager.init();
        this.inventoryManager.init();
        this.healthIndicator.init();

    }

    animate() {
        this.inputHandler.handleInputs();
        this.collisionManager.collisionPeriodic(this.localPlayer);
        this.networking.updatePlayerData();
        this.chatOverlay.onFrame();
        this.inventoryManager.onFrame();
        this.healthIndicator.onFrame();
        this.renderer.onFrame(this.localPlayer);

        this.remoteItemRenderer.onFrame();
        requestAnimationFrame(this.animate.bind(this));
    }

    start() {
        this.init();
        this.animate();
    }
}

// Entry point
