import { Renderer } from './Renderer';
import { InputHandler } from '../input/InputHandler';
import { BananaGun } from '../items/BananaGun';
import { HeldItemInput } from '../input/HeldItemInput';
import {Networking} from "./Networking";

export class Inventory {
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