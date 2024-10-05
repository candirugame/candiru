import { Player } from './Player';
import { Renderer } from './Renderer';
import { ChatOverlay } from './ChatOverlay';
import { InputHandler } from './InputHandler';
import { Networking } from './Networking';
import { CollisionManager } from './CollisionManager';
import { InventoryManager } from './InventoryManager';
import { HealthIndicator } from './HealthIndicator';
import { Map } from './Map';

export class Game {
    private localPlayer: Player;
    private renderer: Renderer;
    private chatOverlay: ChatOverlay;
    private inputHandler: InputHandler;
    private networking: Networking;
    private collisionManager: CollisionManager;
    private inventoryManager: InventoryManager;
    private map: Map;
    private healthIndicator: HealthIndicator;

    constructor() {
        this.localPlayer = new Player();
        this.chatOverlay = new ChatOverlay(this.localPlayer);
        this.networking = new Networking(this.localPlayer, this.chatOverlay);
        this.renderer = new Renderer(this.networking, this.localPlayer, this.chatOverlay);
        this.chatOverlay.setRenderer(this.renderer);
        this.inputHandler = new InputHandler(this.renderer, this.localPlayer);
        this.collisionManager = new CollisionManager(this.renderer);
        this.inventoryManager = new InventoryManager(this.renderer, this.inputHandler, this.networking);
        this.chatOverlay.setNetworking(this.networking);
        this.chatOverlay.setInputHandler(this.inputHandler);
        this.map = new Map('maps/test1.glb', this.renderer);
        this.healthIndicator = new HealthIndicator(this.renderer);
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
        this.renderer.doFrame(this.localPlayer);
        requestAnimationFrame(this.animate.bind(this));
    }

    start() {
        this.init();
        this.animate();
    }
}

// Entry point
