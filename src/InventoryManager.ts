import { Renderer } from './Renderer';
import { InputHandler } from './InputHandler';
import { BananaGun } from './BananaGun';
import { HeldItemInput } from './HeldItemInput';
import {Networking} from "./Networking";

export class InventoryManager {
    private bananaGun: BananaGun;
    private renderer: Renderer;
    private inputHandler: InputHandler;
    private networking: Networking;

    constructor(renderer: Renderer, inputHandler: InputHandler, networking:Networking) {
        this.renderer = renderer;
        this.inputHandler = inputHandler;
        this.networking = networking;
        this.bananaGun = new BananaGun(renderer,networking);
    }

    public init() {
        this.bananaGun.init();
    }

    public onFrame() {
        this.bananaGun.onFrame(
            new HeldItemInput(
                this.inputHandler.getLeftMouseDown(),
                this.inputHandler.getRightMouseDown(),
                false
            )
        );
    }
}