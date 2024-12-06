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
import { TouchInputHandler } from "../input/TouchInputHandler.ts";

export class Game {
    private localPlayer: Player;
    private renderer: Renderer;
    private chatOverlay: ChatOverlay;
    private inputHandler: InputHandler;
    private touchInputHandler: TouchInputHandler;
    private networking: Networking;
    private collisionManager: CollisionManager;
    private inventoryManager: Inventory;
    private mapLoader: MapLoader;
    private healthIndicator: HealthIndicator;
    private remoteItemRenderer: RemoteItemRenderer;
    private gameIndex: number;
    private static nextGameIndex: number = 0;


    constructor(container: HTMLElement) {
        this.gameIndex = Game.nextGameIndex++;
        this.localPlayer = new Player();
        this.chatOverlay = new ChatOverlay(this.localPlayer);
        this.networking = new Networking(this.localPlayer, this.chatOverlay);
        this.renderer = new Renderer(container, this.networking, this.localPlayer, this.chatOverlay);
        this.chatOverlay.setRenderer(this.renderer);
        this.inputHandler = new InputHandler(this.renderer, this.localPlayer, this.gameIndex);
        this.touchInputHandler = new TouchInputHandler(this.inputHandler, this.chatOverlay);
        this.renderer.setInputHandler(this.inputHandler);
        this.collisionManager = new CollisionManager(this.inputHandler);
        this.renderer.setCollisionManager(this.collisionManager);
        this.inventoryManager = new Inventory(this.renderer, this.inputHandler, this.networking, this.localPlayer);
        this.chatOverlay.setNetworking(this.networking);
        this.chatOverlay.setInputHandler(this.inputHandler);
        this.mapLoader = new MapLoader(this.renderer);
        this.healthIndicator = new HealthIndicator(this.renderer,this.localPlayer);
        this.remoteItemRenderer = new RemoteItemRenderer(this.networking, this.renderer);
    }

    init() {
        this.mapLoader.load('maps/crackhouse_1/map.glb');
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
