import { Player } from './Player';
import { Renderer } from './Renderer';
import { ChatOverlay } from './ChatOverlay';
import { InputHandler } from './InputHandler';
import { Networking } from './Networking';
import { CollisionManager } from './CollisionManager';
import { InventoryManager } from './InventoryManager';

export class Game {
    private localPlayer: Player;
    private renderer: Renderer;
    private chatOverlay: ChatOverlay;
    private inputHandler: InputHandler;
    private networking: Networking;
    private collisionManager: CollisionManager;
    private inventoryManager: InventoryManager;

    constructor() {
        this.localPlayer = new Player();
        this.chatOverlay = new ChatOverlay(this.localPlayer);
        this.networking = new Networking(this.localPlayer, this.chatOverlay);
        this.renderer = new Renderer(this.networking, this.localPlayer, this.chatOverlay);
        this.chatOverlay.setRenderer(this.renderer);
        this.inputHandler = new InputHandler(this.renderer, this.localPlayer);
        this.collisionManager = new CollisionManager(this.renderer);
        this.inventoryManager = new InventoryManager(this.renderer, this.inputHandler);
        this.chatOverlay.setNetworking(this.networking);
    }

    init() {
        this.collisionManager.init();
        this.inventoryManager.init();
    }

    animate() {
        this.inputHandler.handleInputs();
        this.networking.updatePlayerData();
        this.collisionManager.collisionPeriodic(this.localPlayer);
        this.chatOverlay.onFrame();
        this.inventoryManager.onFrame();
        this.renderer.doFrame(this.localPlayer);
        requestAnimationFrame(this.animate.bind(this));
    }

    start() {
        this.init();
        this.animate();
    }
}

// Entry point