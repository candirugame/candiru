import { Player } from './Player';
import { Renderer } from './Renderer';
import { ChatOverlay } from '../ui/ChatOverlay';
import { InputHandler } from '../input/InputHandler';
import { Networking } from './Networking';
import { CollisionManager } from '../input/CollisionManager';
import { Inventory } from './Inventory';
import { HealthIndicator } from '../ui/HealthIndicator';
import { MapLoader } from './MapLoader';

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

    constructor() {
        this.localPlayer = new Player();
        this.chatOverlay = new ChatOverlay(this.localPlayer);
        this.networking = new Networking(this.localPlayer, this.chatOverlay);
        this.renderer = new Renderer(this.networking, this.localPlayer, this.chatOverlay);
        this.chatOverlay.setRenderer(this.renderer);
        this.inputHandler = new InputHandler(this.renderer, this.localPlayer);
        this.collisionManager = new CollisionManager(this.renderer, this.inputHandler);
        this.inventoryManager = new Inventory(this.renderer, this.inputHandler, this.networking, this.localPlayer);
        this.chatOverlay.setNetworking(this.networking);
        this.chatOverlay.setInputHandler(this.inputHandler);
        this.map = new MapLoader('maps/test1.glb', this.renderer, this.collisionManager);
        this.healthIndicator = new HealthIndicator(this.renderer,this.localPlayer);
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
        requestAnimationFrame(this.animate.bind(this));
    }

    start() {
        this.init();
        this.animate();
    }
}

// Entry point
