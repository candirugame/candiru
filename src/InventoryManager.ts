import { Renderer } from './Renderer';
import { InputHandler } from './InputHandler';
import { BananaGun } from './BananaGun';
import { HeldItemInput } from './HeldItemInput';

export class InventoryManager {
    private bananaGun: BananaGun;
    private renderer: Renderer;
    private inputHandler: InputHandler;

    constructor(renderer: Renderer, inputHandler: InputHandler) {
        this.renderer = renderer;
        this.inputHandler = inputHandler;
        this.bananaGun = new BananaGun(renderer);
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